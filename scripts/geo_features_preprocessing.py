"""
Extracts geographic feature annotations from Middle Earth map.

Geographic features are natural landmarks that get labels:
  * '?Name' (adjacent to a geographic terrain character)
  * Embedded names like "Mirkwood" inside forest tiles

Geographic labels are differentiated from POI labels (which use '!' prefix).

It returns:
    clean_grid      – a **deep-copied** version of the input with every
                      geographic label removed / terrain restored
    geo_id_grid     – H×W numpy.int16 array holding a feature-id for every
                      cell (-1 for "no feature")
    feature_names   – list[str] giving the text for each feature-id
    seed_rows       – list[int]  row of the label that named the feature
    seed_cols       – list[int]  col of the label that named the feature
"""
from __future__ import annotations
import collections, math, numpy as np
from typing import List, Tuple, Dict, Any, Iterable

################################################################################
# CONSTANTS & HELPERS
################################################################################
DIRS = [(1,0),(-1,0),(0,1),(0,-1)]
TERRAIN_FEATURE_CHARS = {'^', '~', '&', '%', '=', '"'}      # mountains, hills, forest, marsh, deep water, fields
TRANSPARENT = {'.', '-', '|', '+'}                     # roads / rivers ignored for connectivity
LABEL_CHARS   = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'")

def _is_label_char(ch: str) -> bool:
    return ch in LABEL_CHARS

def _in_bounds(r:int,c:int,H:int,W:int)->bool:
    return 0 <= r < H and 0 <= c < W

################################################################################
# LABEL DETECTION
################################################################################
def _detect_labels(grid: List[List[str]]) -> List[Dict[str,Any]]:
    """Scan grid for embedded or '?'-prefixed geographic labels."""
    H, W = len(grid), len(grid[0]) if grid else 0
    labels = []
    r = 0
    while r < H:
        c = 0
        while c < W:
            ch = grid[r][c]
            # ---------- POI labels ("!Name") - skip entirely ----------
            if ch == '!' and c+1 < W and _is_label_char(grid[r][c+1]):
                c += 1
                # Skip the entire POI label
                while c < W and _is_label_char(grid[r][c]):
                    c += 1
                continue
            # ---------- adjacent ("?Name") ----------
            if ch == '?' and c+1 < W and _is_label_char(grid[r][c+1]):
                start_c = c
                c += 1
                chars = []
                while c < W and _is_label_char(grid[r][c]):
                    chars.append(grid[r][c]); c += 1
                label = ''.join(chars)
                if label:
                    terrain, comp_r, comp_c = _nearest_feature_terrain(grid, r, start_c)
                    if terrain:
                        labels.append({
                            'text': label,
                            'row': r, 'col': start_c,
                            'terrain': terrain,
                            'type': 'adjacent',
                            'component_seed': (comp_r, comp_c)
                        })
                continue
            # ---------- embedded ("Mirkwood" in forest) ----------
            if _is_label_char(ch):
                start_c = c
                chars = []
                while c < W and _is_label_char(grid[r][c]):
                    chars.append(grid[r][c]); c += 1
                if len(chars) >= 3:                           # 3+ chars = label candidate
                    label = ''.join(chars)
                    terrain = _infer_embedded_terrain(grid, r, start_c, len(chars))
                    if terrain in TERRAIN_FEATURE_CHARS:
                        labels.append({
                            'text': label,
                            'row': r, 'col': start_c,
                            'terrain': terrain,
                            'type': 'embedded'
                        })
                continue
            c += 1
        r += 1
    return labels

def _infer_embedded_terrain(grid: List[List[str]], r:int, c0:int, length:int) -> str|None:
    """Return the majority terrain surrounding an embedded label."""
    H = len(grid)
    counts = collections.Counter()
    for dc in range(-1, length+1):
        for dr in (-1,0,1):
            nr, nc = r+dr, c0+dc
            if 0 <= nr < H and 0 <= nc < len(grid[nr]):
                ch = grid[nr][nc]
                if ch in TERRAIN_FEATURE_CHARS:
                    counts[ch] += 1
    if not counts:      # label in open space – treat as invalid
        return None
    return counts.most_common(1)[0][0]

def _nearest_feature_terrain(grid: List[List[str]], r:int, c:int,
                             max_radius:int|None=None
                             ) -> Tuple[str | None, int | None, int | None]:
    """
    For a '?Name' adjacent label find the NEAREST (fewest steps) terrain feature,
    counting diagonal moves as legitimate steps.  Returns
        (terrain_char, row, col)   or   (None, None, None) if none found.

    The search expands in 8-connected space (so "nearest" uses Chebyshev
    distance rather than purely orthogonal Manhattan distance).
    """
    H, W = len(grid), len(grid[0])
    # 8-direction offsets ----------------------------------------------------
    DIRS8 = [(-1,-1), (-1,0), (-1,1),
             ( 0,-1),          ( 0,1),
             ( 1,-1), ( 1,0),  ( 1,1)]

    seen = {(r, c)}
    q = collections.deque([(r, c, 0)])          # (row, col, distance)
    while q:
        rr, cc, dist = q.popleft()
        if max_radius is not None and dist > max_radius:
            continue
        for dr, dc in DIRS8:
            nr, nc = rr + dr, cc + dc
            if not _in_bounds(nr, nc, H, W) or (nr, nc) in seen:
                continue
            seen.add((nr, nc))
            ch = grid[nr][nc]
            if ch in TERRAIN_FEATURE_CHARS:
                return ch, nr, nc
            q.append((nr, nc, dist + 1))
    return None, None, None

################################################################################
# GRID CLEAN-UP (LABEL REMOVAL, TERRAIN RESTORATION)
################################################################################
def _restore_terrain(clean_grid: List[List[str]], labels: List[Dict[str,Any]]) -> None:
    """
    Mutate `clean_grid`:
      * embedded labels get overwritten by their inferred terrain
      * '?Name' labels are blanked to space
    """
    for lbl in labels:
        r, c = lbl['row'], lbl['col']
        if lbl['type'] == 'embedded':
            terrain = lbl['terrain']
            for i in range(len(lbl['text'])):
                clean_grid[r][c+i] = terrain
        else:                                           # adjacent '?Name'
            for i in range(len(lbl['text'])+1):         # inc "?"
                clean_grid[r][c+i] = ' '                # blank to open ground

################################################################################
# CONNECTED-COMPONENT ANALYSIS
################################################################################
def _find_components(grid: List[List[str]],
                     terrain_char: str) -> Tuple[np.ndarray,int]:
    """
    Return:
        comp_id_grid – H×W np.int32 where value == component id or -1
        n_components – number of discovered components
    Rivers & roads (TRANSPARENT set) are treated as see-through.
    """
    H, W = len(grid), len(grid[0])
    comp = np.full((H,W), -1, dtype=np.int32)
    next_id = 0

    def is_connectable(rr:int,cc:int)->bool:
        ch = grid[rr][cc]
        return ch == terrain_char or ch in TRANSPARENT

    for r in range(H):
        for c in range(W):
            if grid[r][c] != terrain_char or comp[r,c] != -1:
                continue
            # BFS for this component
            q = collections.deque([(r,c)])
            comp[r,c] = next_id
            while q:
                rr,cc = q.popleft()
                for dr,dc in DIRS:
                    nr,nc = rr+dr, cc+dc
                    if not _in_bounds(nr,nc,H,W): continue
                    if comp[nr,nc] != -1: continue
                    if not is_connectable(nr,nc):  continue
                    # mark transparent tiles too, but only enqueue if same terrain
                    comp[nr,nc] = next_id
                    if grid[nr][nc] == terrain_char:
                        q.append((nr,nc))
            next_id += 1
    return comp, next_id

################################################################################
# MAIN PUBLIC DRIVER
################################################################################
def build_geo_feature_grid(grid: List[List[str]]):
    """
    Entrypoint used by map_preprocessing.py

    Args
    ----
    grid : List[List[str]]
        The grid *after* realm/sub-realm annotations have been stripped,
        but *before* any terrain modifications for geo features.

    Returns
    -------
    clean_grid     – grid with geographic labels removed / terrain restored
    geo_id_grid    – numpy array int16, value -1 means 'no named feature'
    feature_names  – list[str] length == max geo-id+1
    seed_rows      – list[int] – one per feature, row where its label was found
    seed_cols      – list[int] – one per feature, col where its label was found
    """
    # 1. Detect labels on a fresh deep copy so original grid isn't mutated early
    labels = _detect_labels(grid)
    clean_grid = [row[:] for row in grid]               # deep copy by row
    _restore_terrain(clean_grid, labels)

    # 2. Connected components for each terrain type
    H, W = len(clean_grid), len(clean_grid[0]) if clean_grid else 0
    geo_id_grid = np.full((H,W), -1, dtype=np.int16)

    feature_names : List[str] = []
    seed_rows     : List[int] = []
    seed_cols     : List[int] = []

    terrain_to_comp_map : Dict[str, np.ndarray] = {}
    terrain_to_comp_count : Dict[str,int] = {}

    # Pre-compute component grids once per terrain type
    for tch in TERRAIN_FEATURE_CHARS:
        comp, ncomp = _find_components(clean_grid, tch)
        terrain_to_comp_map[tch] = comp
        terrain_to_comp_count[tch] = ncomp

    # 3. Assign component-level ids
    comp_to_featureid : Dict[Tuple[str,int], int] = {}

    for lbl in labels:
        tch = lbl['terrain']
        if tch is None:           # label couldn't decide terrain – skip
            continue
        comp_grid = terrain_to_comp_map[tch]
        if lbl['type'] == 'embedded':
            rr,cc = lbl['row'], lbl['col']
        else:
            # adjacent label – use saved component seed found during detection
            rr,cc = lbl.get('component_seed', (None,None))
            if rr is None: continue
        comp_id = comp_grid[rr,cc]
        if comp_id == -1: continue
        key = (tch, comp_id)
        if key not in comp_to_featureid:
            fid = len(feature_names)
            comp_to_featureid[key] = fid
            feature_names.append(lbl['text'])
            seed_rows.append(rr)
            seed_cols.append(cc)
        else:
            # Multiple labels for same component – pick the "best" (longest)
            fid = comp_to_featureid[key]
            if len(lbl['text']) > len(feature_names[fid]):
                feature_names[fid] = lbl['text']   # override to longer name

    # 4. Write final geo_id_grid
    for tch, comp_grid in terrain_to_comp_map.items():
        it = np.nditer(comp_grid, flags=['multi_index'])
        for cid in it:
            cid_int = int(cid)
            if cid_int == -1: continue
            fid = comp_to_featureid.get((tch, cid_int))
            if fid is not None:
                r,c = it.multi_index
                geo_id_grid[r,c] = fid

    return clean_grid, geo_id_grid, feature_names, seed_rows, seed_cols