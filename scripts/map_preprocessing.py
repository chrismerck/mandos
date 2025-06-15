#!/usr/bin/env python3
import os, sys, heapq, collections, numpy as np, struct, csv

# ---------------- Load map ----------------
def load_map(map_path):
    if not os.path.exists(map_path):
        raise FileNotFoundError(f"Map file not found: {map_path}")
    
    with open(map_path, 'r', encoding='utf-8') as f:
        lines = [ln.rstrip('\n') for ln in f]
    H = len(lines)
    W = max(len(ln) for ln in lines) if lines else 0
    grid = [list(ln.ljust(W)) for ln in lines]
    return grid, H, W

# ---------------- Helper: flood water incl. text ----------------
dirs = [(1,0),(-1,0),(0,1),(0,-1)]
def build_water_mask(grid):
    """Return mask of cells considered ocean ( '=' or adjacent label characters )."""
    H=len(grid); W=len(grid[0])
    water=np.zeros((H,W),bool)
    dq=collections.deque()
    # seed with '=' cells
    for r in range(H):
        for c in range(W):
            if grid[r][c]=='=' and not water[r,c]:
                water[r,c]=True; dq.append((r,c))
    # allowed chars to absorb: '=' or alphabetic/underscore/apostrophe
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

# ---------------- Parse annotation seeds ----------------
def parse_annotations(grid, H, W):
    def register(name, mapping):
        if name not in mapping:
            mapping[name] = len(mapping)
        return mapping[name]
    
    realm_map, sub_map = {}, {}
    realm_seeds, sub_seeds = {}, {}
    realm_names = []  # Keep order
    sub_names = []    # Keep order
    
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
                        rid=register(name, realm_map)
                        if rid == len(realm_names):
                            realm_names.append(name)
                        realm_seeds[(r,c)]=rid
                    else:
                        sid=register(name, sub_map)
                        if sid == len(sub_names):
                            sub_names.append(name)
                        sub_seeds[(r,c)]=sid
                    for cc in range(c,k+1): grid[r][cc]=' '
                    c=k
            c+=1
    
    return realm_map, sub_map, realm_seeds, sub_seeds, realm_names, sub_names

# ---------------- Terrain cost ----------------
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

# ---------------- Multi-source Dijkstra ----------------
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

# ---------------- Main processing ----------------
def process_map(map_path, output_grid_path, output_poi_path):
    # Load map
    grid, H, W = load_map(map_path)
    
    # Build water mask before modifying grid
    original_grid=[row[:] for row in grid]
    water_mask=build_water_mask(original_grid)
    
    # Parse annotations
    realm_map, sub_map, realm_seeds, sub_seeds, realm_names, sub_names = parse_annotations(grid, H, W)
    num_realms=len(realm_map)
    sub_offset=num_realms
    
    # Build cost grid
    cost = build_cost_grid(grid, water_mask, H, W)
    
    # Run Dijkstra passes
    combined={**realm_seeds, **{pos: sub_offset+sid for pos,sid in sub_seeds.items()}}
    owner_all=multi_dijkstra(combined, cost, H, W)
    owner_realm=multi_dijkstra(realm_seeds, cost, H, W)
    
    # Determine sub-realm parents
    sub_parent={sid: owner_realm[r,c] for (r,c),sid in sub_seeds.items()}
    
    # Final realm assignment
    final_realm=owner_realm.copy()
    for r in range(H):
        for c in range(W):
            gid=owner_all[r,c]
            if gid>=sub_offset:
                parent=sub_parent.get(gid-sub_offset,-1)
                if parent>=0: final_realm[r,c]=parent
    
    # Sub-realm assignment within each realm
    final_sub=np.full((H,W),-1,int)
    for rid in range(num_realms):
        mask=final_realm==rid
        seeds={pos:sid for pos,sid in sub_seeds.items() if sub_parent[sid]==rid}
        if seeds:
            sub_owner=multi_dijkstra(seeds, cost, H, W, restrict=mask)
            final_sub[mask]=sub_owner[mask]
    
    # Write binary grid file
    # Format: Header (magic, version, W, H) + grid data (realm_id, sub_id per cell)
    with open(output_grid_path, 'wb') as f:
        # Header
        f.write(b'REG1')  # Magic number
        f.write(struct.pack('HHH', 1, W, H))  # Version, Width, Height
        
        # Grid data
        for r in range(H):
            for c in range(W):
                realm_id = final_realm[r,c] if final_realm[r,c] >= 0 else 255
                sub_id = final_sub[r,c] if final_sub[r,c] >= 0 else 255
                f.write(struct.pack('BB', realm_id, sub_id))
        
        # Name tables
        # Number of realms
        f.write(struct.pack('B', len(realm_names)))
        for name in realm_names:
            name_bytes = name.encode('utf-8')
            f.write(struct.pack('B', len(name_bytes)))
            f.write(name_bytes)
        
        # Number of sub-realms
        f.write(struct.pack('B', len(sub_names)))
        for name in sub_names:
            name_bytes = name.encode('utf-8')
            f.write(struct.pack('B', len(name_bytes)))
            f.write(name_bytes)
    
    # Write POI CSV
    with open(output_poi_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['name', 'row', 'col', 'realm_id', 'sub_id', 'type'])
        
        # Write realm seeds as POIs
        for (r,c), rid in realm_seeds.items():
            realm_name = realm_names[rid]
            writer.writerow([realm_name, r, c, rid, -1, 'Realm'])
        
        # Write sub-realm seeds as POIs
        for (r,c), sid in sub_seeds.items():
            sub_name = sub_names[sid]
            parent_rid = sub_parent[sid]
            writer.writerow([sub_name, r, c, parent_rid, sid, 'SubRealm'])
    
    print(f"Processed {W}x{H} map")
    print(f"Found {len(realm_names)} realms and {len(sub_names)} sub-realms")
    print(f"Binary grid written to: {output_grid_path}")
    print(f"POI data written to: {output_poi_path}")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python map_preprocessing.py <input_map> <output_grid> <output_poi>")
        sys.exit(1)
    
    process_map(sys.argv[1], sys.argv[2], sys.argv[3])