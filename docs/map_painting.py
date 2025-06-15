import os, heapq, colorsys, collections, numpy as np, matplotlib.pyplot as plt, matplotlib, string

# ---------------- Load map ----------------
MAP_PATH = 'maps/middle_earth.worldmap'
if not os.path.exists(MAP_PATH):
    raise FileNotFoundError("world map missing – please re‑upload.")

with open(MAP_PATH, 'r', encoding='utf-8') as f:
    lines = [ln.rstrip('\n') for ln in f]
H = len(lines); W = max(len(ln) for ln in lines)
grid = [list(ln.ljust(W)) for ln in lines]

# ---------------- Helper: flood water incl. text ----------------
dirs = [(1,0),(-1,0),(0,1),(0,-1)]
def build_water_mask(grid):
    """Return mask of cells considered ocean ( '=' or adjacent label characters )."""
    H=len(grid); W=len(grid[0])
    water=np.zeros((H,W),bool)
    dq=collections.deque()
    # seed with '=' cells at map edge (plus any connected internal '=' if want; start with all '=')
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

# We will build water mask first (before modifying grid so we capture original label chars)
original_grid=[row[:] for row in grid]
water_mask=build_water_mask(original_grid)

# ---------------- Parse annotation seeds ----------------
def register(name, mapping):
    if name not in mapping:
        mapping[name] = len(mapping)
    return mapping[name]

realm_map, sub_map = {}, {}
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
                    rid=register(name, realm_map); realm_seeds[(r,c)]=rid
                else:
                    sid=register(name, sub_map); sub_seeds[(r,c)]=sid
                for cc in range(c,k+1): grid[r][cc]=' '
                c=k
        c+=1

num_realms=len(realm_map); sub_offset=num_realms

# ---------------- Terrain cost ----------------
IMPASS=1e6
TERRAIN_COST={' ':1,'.':1, ',':2,';':2, '#':8,'&':8, '%':12, '^':100,
              '-':10,'|':10,'+':1,'=':50}
cost=np.empty((H,W),float)
for r in range(H):
    for c in range(W):
        if water_mask[r,c]:
            cost[r,c]=50
        else:
            cost[r,c]=TERRAIN_COST.get(grid[r][c],1)

# ---------------- Multi-source Dijkstra ----------------
def multi_dijkstra(seeds, restrict=None):
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

combined={**realm_seeds, **{pos: sub_offset+sid for pos,sid in sub_seeds.items()}}
owner_all=multi_dijkstra(combined)
owner_realm=multi_dijkstra(realm_seeds)

sub_parent={sid: owner_realm[r,c] for (r,c),sid in sub_seeds.items()}
final_realm=owner_realm.copy()
for r in range(H):
    for c in range(W):
        gid=owner_all[r,c]
        if gid>=sub_offset:
            parent=sub_parent.get(gid-sub_offset,-1)
            if parent>=0: final_realm[r,c]=parent

final_sub=np.full((H,W),-1,int)
for rid in range(num_realms):
    mask=final_realm==rid
    seeds={pos:sid for pos,sid in sub_seeds.items() if sub_parent[sid]==rid}
    if seeds:
        sub_owner=multi_dijkstra(seeds, restrict=mask)
        final_sub[mask]=sub_owner[mask]

# ---------------- Colour palette ----------------
realm_colors={'Gondor':(0.55,0.41,0.18),'South_Gondor':(0.55,0.41,0.18),
              'Mordor':(0.55,0.0,0.0),'Arnor':(0.1,0.3,0.7)}
default_palette=[(0.0,0.6,0.0),(0.6,0.6,0.0),(0.2,0.5,0.5),(0.8,0.0,0.8)]
def make_shades(base,n):
    h,l,s=colorsys.rgb_to_hls(*base)
    if n==1: return [base]
    return [colorsys.hls_to_rgb(h,0.25+0.5*i/(n-1),s) for i in range(n)]

realm_core={}
sub_color={}
for name,rid in realm_map.items():
    base=realm_colors.get(name, default_palette[rid%len(default_palette)])
    subs=[sid for sid,p in sub_parent.items() if p==rid]
    palette=make_shades(base,len(subs)+1)
    realm_core[rid]=palette[0]
    for i,sid in enumerate(sorted(subs)):
        sub_color[sid]=palette[i+1]

# ---------------- Compose RGB ----------------
img=np.zeros((H,W,3))
for r in range(H):
    for c in range(W):
        if water_mask[r,c]:
            img[r,c]=[0,0,0]
        else:
            sid=final_sub[r,c]
            if sid>=0: img[r,c]=sub_color[sid]
            else: img[r,c]=realm_core.get(final_realm[r,c],(0.5,0.5,0.5))

# ---------------- Plot ----------------
fig,ax=plt.subplots(figsize=(14,8),facecolor='black')
ax.imshow(img,origin='upper')
ax.contour(final_realm,levels=np.arange(-0.5,num_realms+0.5,1),colors='white',linewidths=2)
ax.set_title("Realm & Sub-Region Map – Water Labels Cleared",color='white',fontsize=16,pad=12)
ax.axis('off')
for (r,c),rid in realm_seeds.items():
    name=[n for n,i in realm_map.items() if i==rid][0]
    ax.text(c,r,name,color='white',fontsize=8,fontweight='bold',ha='center',va='center')
for (r,c),sid in sub_seeds.items():
    name=[n for n,i in sub_map.items() if i==sid][0]
    ax.text(c,r+0.25,name,color='black',fontsize=5,ha='center',va='center')

plt.show()
