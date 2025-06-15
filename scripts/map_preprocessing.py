#!/usr/bin/env python3
import os, sys, heapq, collections, struct, csv, numpy as np

# --------------------------------------------------------------------------- #
#  Imports for new geographic feature support
# --------------------------------------------------------------------------- #
from geo_features_preprocessing import build_geo_feature_grid

# ---------------- Load map -------------------------------------------------- #
def load_map(map_path):
    if not os.path.exists(map_path):
        raise FileNotFoundError(f"Map file not found: {map_path}")
    with open(map_path, 'r', encoding='utf-8') as f:
        lines = [ln.rstrip('\n') for ln in f]
    H = len(lines)
    W = max(len(ln) for ln in lines) if lines else 0
    grid = [list(ln.ljust(W)) for ln in lines]
    return grid, H, W

# ---------------- Helper: flood water incl. text --------------------------- #
dirs = [(1,0),(-1,0),(0,1),(0,-1)]
def build_water_mask(grid):
    """Return mask of cells considered ocean ( '=' or adjacent label characters )."""
    H=len(grid); W=len(grid[0])
    water=np.zeros((H,W),bool)
    dq=collections.deque()
    for r in range(H):
        for c in range(W):
            if grid[r][c]=='=' and not water[r,c]:
                water[r,c]=True; dq.append((r,c))
    def is_water_char(ch):
        return ch=='=' or ch.isalpha() or ch=='_' or ch=="'"
    while dq:
        r,c=dq.popleft()
        for dr,dc in dirs:
            nr,nc=r+dr,c+dc
            if 0<=nr<H and 0<=nc<W and not water[nr,nc] and is_water_char(grid[nr][nc]):
                water[nr,nc]=True
                dq.append((nr,nc))
    return water

# ---------------- Parse annotation seeds ----------------------------------- #
def parse_annotations(grid, H, W):
    def register(name, mapping, order_list):
        if name not in mapping:
            mapping[name] = len(mapping)
            order_list.append(name)
        return mapping[name]

    realm_map, sub_map = {}, {}
    realm_names, sub_names = [], []
    realm_seeds, sub_seeds = {}, {}

    for r in range(H):
        c=0
        while c<W:
            ch=grid[r][c]
            if ch in ('[','('):
                close=']' if ch=='[' else ')'
                k=c+1
                name_chars=[]
                while k<W and grid[r][k]!=close:
                    name_chars.append(grid[r][k]); k+=1
                if k<W:
                    name=''.join(name_chars)
                    if ch=='[':
                        rid=register(name, realm_map, realm_names)
                        realm_seeds[(r,c)] = rid
                    else:
                        sid=register(name, sub_map, sub_names)
                        sub_seeds[(r,c)] = sid
                    # blank annotation text
                    for cc in range(c,k+1): grid[r][cc]=' '
                    c=k
            c+=1
    return realm_map, sub_map, realm_seeds, sub_seeds, realm_names, sub_names

# ---------------- Terrain cost --------------------------------------------- #
TERRAIN_COST={' ':1,'.':1, ',':2,';':2, '#':8,'&':8, '%':12, '^':100,
              '-':10,'|':10,'+':1,'=':50}
def build_cost_grid(grid, water_mask, H, W):
    cost=np.empty((H,W),float)
    for r in range(H):
        for c in range(W):
            if water_mask[r,c]:
                cost[r,c]=50
            else:
                cost[r,c]=TERRAIN_COST.get(grid[r][c],1)
    return cost

# ---------------- Multi-source Dijkstra ------------------------------------ #
def multi_dijkstra(seeds, cost, H, W, restrict=None):
    dist=np.full((H,W),np.inf)
    owner=np.full((H,W),-1,int)
    pq=[]
    for (r,c),sid in seeds.items():
        dist[r,c]=0; owner[r,c]=sid; heapq.heappush(pq,(0,r,c,sid))
    while pq:
        d,r,c,sid=heapq.heappop(pq)
        if d!=dist[r,c] or owner[r,c]!=sid: continue
        for dr,dc in dirs:
            nr,nc=r+dr,c+dc
            if 0<=nr<H and 0<=nc<W:
                if restrict is not None and not restrict[nr,nc]:
                    continue
                nd=d+cost[nr,nc]
                if nd<dist[nr,nc]:
                    dist[nr,nc]=nd; owner[nr,nc]=sid; heapq.heappush(pq,(nd,nr,nc,sid))
    return owner

# ---------------- Main processing ------------------------------------------ #
def process_map(map_path, output_grid_path, output_poi_path):
    # 1) Load map
    grid, H, W = load_map(map_path)

    # 2) Water mask **before** we mutate anything
    original_grid = [row[:] for row in grid]
    water_mask = build_water_mask(original_grid)

    # 3) Realm / sub-realm parsing  (this blanks annotations in `grid`)
    realm_map, sub_map, realm_seeds, sub_seeds, realm_names, sub_names = \
        parse_annotations(grid, H, W)

    # 4) Geographic feature detection – returns grid with geo labels removed
    clean_grid, geo_id_grid, geo_names, geo_seed_rows, geo_seed_cols = \
        build_geo_feature_grid(grid)

    # Swap in the cleaned grid for all subsequent processing
    grid = clean_grid

    # 5) Build movement cost grid (uses cleaned terrain)
    cost = build_cost_grid(grid, water_mask, H, W)

    # 6) Dijkstra passes for region ownership
    num_realms = len(realm_names)
    sub_offset  = num_realms
    combined = {**realm_seeds, **{pos: sub_offset+sid for pos,sid in sub_seeds.items()}}
    owner_all   = multi_dijkstra(combined, cost, H, W)
    owner_realm = multi_dijkstra(realm_seeds, cost, H, W)

    # 7) Determine which realm each sub-realm lives in
    sub_parent = {sid: owner_realm[r,c] for (r,c),sid in sub_seeds.items()}

    # 8) Final realm grid (inherit parent realm for cells dominated by a sub-realm)
    final_realm = owner_realm.copy()
    for r in range(H):
        for c in range(W):
            gid = owner_all[r,c]
            if gid >= sub_offset:
                parent = sub_parent.get(gid - sub_offset, -1)
                if parent >= 0:
                    final_realm[r,c] = parent

    # 9) Sub-realm assignment within realms
    final_sub = np.full((H,W), -1, int)
    for rid in range(num_realms):
        mask = final_realm == rid
        seeds = {pos:sid for pos,sid in sub_seeds.items() if sub_parent[sid]==rid}
        if seeds:
            sub_owner = multi_dijkstra(seeds, cost, H, W, restrict=mask)
            final_sub[mask] = sub_owner[mask]

    # --------------------------------------------------------------------- #
    # 10) Write REG2 binary grid
    # --------------------------------------------------------------------- #
    with open(output_grid_path, 'wb') as f:
        # Header
        f.write(b'REG2')                       # Magic
        f.write(struct.pack('HHH', 2, W, H))   # Version 2, W, H

        # Per-tile bytes: realm_id, sub_id, geo_id
        flat_realm = final_realm.ravel()
        flat_sub   = final_sub.ravel()
        flat_geo   = geo_id_grid.ravel()
        for rid, sid, gid in zip(flat_realm, flat_sub, flat_geo):
            f.write(struct.pack('BBB',
                                rid if rid >= 0 else 255,
                                sid if sid >= 0 else 255,
                                gid if gid >= 0 else 255))

        # ----- name tables: realms, sub-realms, geo features -----
        def _write_table(names:list[str]):
            f.write(struct.pack('B', len(names)))
            for nm in names:
                b = nm.encode('utf-8')
                if len(b) > 255:
                    raise ValueError(f"Name too long: {nm}")
                f.write(struct.pack('B', len(b)))
                f.write(b)

        _write_table(realm_names)
        _write_table(sub_names)
        _write_table(geo_names)

    # --------------------------------------------------------------------- #
    # 11) Write POI CSV (realms, sub-realms, geo features)
    # --------------------------------------------------------------------- #
    with open(output_poi_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['name', 'row', 'col', 'realm_id', 'sub_id',
                         'geo_id', 'type'])

        # Realm seeds
        for (r,c), rid in realm_seeds.items():
            writer.writerow([realm_names[rid], r, c, rid, -1, -1, 'Realm'])

        # Sub-realm seeds
        for (r,c), sid in sub_seeds.items():
            parent_rid = sub_parent[sid]
            writer.writerow([sub_names[sid], r, c, parent_rid, sid, -1, 'SubRealm'])

        # Geographic feature seeds
        for fid, (r,c) in enumerate(zip(geo_seed_rows, geo_seed_cols)):
            writer.writerow([geo_names[fid], r, c, -1, -1, fid, 'GeoFeature'])

    # --------------------------------------------------------------------- #
    # 12) Done
    # --------------------------------------------------------------------- #
    print(f"Processed {W}×{H} map")
    print(f"Realms        : {len(realm_names)}")
    print(f"Sub-realms    : {len(sub_names)}")
    print(f"Geo-features  : {len(geo_names)}")
    print(f"Binary grid   : {output_grid_path}")
    print(f"POI csv       : {output_poi_path}")

# ---------------- CLI wrapper ---------------------------------------------- #
if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python map_preprocessing.py <input_map> <output_grid> <output_poi>")
        sys.exit(1)
    process_map(sys.argv[1], sys.argv[2], sys.argv[3])
