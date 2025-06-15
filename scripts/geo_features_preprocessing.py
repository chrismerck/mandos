"""
Extracts geographic feature annotations from Middle Earth map.

Geographic features are natural landmarks that get labels:
  * '?Name' (adjacent to a geographic terrain character)
  * Embedded names like "Mirkwood" inside forest tiles

Geographic labels are differentiated from POI labels (which use '!' prefix) 
and river labels (which use '@' prefix).

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
import collections, math, numpy as np, heapq
from typing import List, Tuple, Dict, Any, Iterable

################################################################################
# CONSTANTS & HELPERS
################################################################################
DIRS = [(1,0),(-1,0),(0,1),(0,-1)]
TERRAIN_FEATURE_CHARS = {'^', '~', '&', '%', '=', '"'}      # mountains, hills, forest, marsh, deep water, fields
TRANSPARENT = {'.', '-', '|', '+'}                     # roads / rivers ignored for connectivity
LABEL_CHARS   = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'")
RIVER_CHARS = {'-', '|'}  # River tiles that deep water should not flood into

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
            # ---------- River labels (@Name) - skip entirely ----------
            if ch == '@' and c+1 < W and _is_label_char(grid[r][c+1]):
                c += 1
                # Skip the entire river label
                while c < W and _is_label_char(grid[r][c]):
                    c += 1
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
# MULTI-SOURCE DIJKSTRA FOR GEOGRAPHIC FEATURES
################################################################################
def _multi_source_dijkstra(grid: List[List[str]], seeds: List[Tuple[int,int,int]], 
                          terrain_char: str) -> np.ndarray:
    """
    Run multi-source Dijkstra to assign each terrain tile to nearest labeled feature.
    
    Args:
        grid: The terrain grid
        seeds: List of (row, col, feature_id) tuples for each labeled feature
        terrain_char: The terrain type we're processing
        
    Returns:
        owner_grid: H×W array where each cell contains feature_id or -1
    """
    H, W = len(grid), len(grid[0]) if grid else 0
    dist = np.full((H, W), np.inf)
    owner = np.full((H, W), -1, dtype=np.int16)
    pq = []
    
    # Initialize seeds
    for r, c, fid in seeds:
        dist[r, c] = 0
        owner[r, c] = fid
        heapq.heappush(pq, (0, r, c, fid))
    
    # Special handling for deep water - don't cross rivers
    def can_expand_to(from_r, from_c, to_r, to_c):
        if not _in_bounds(to_r, to_c, H, W):
            return False
        to_ch = grid[to_r][to_c]
        
        # For deep water, don't expand into rivers
        if terrain_char == '=' and to_ch in RIVER_CHARS:
            return False
            
        # Otherwise, can expand to same terrain or transparent tiles
        return to_ch == terrain_char or to_ch in TRANSPARENT
    
    # Dijkstra expansion
    while pq:
        d, r, c, fid = heapq.heappop(pq)
        
        # Skip if we've found a better path
        if d > dist[r, c]:
            continue
            
        # Try all 4 directions
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            
            if not can_expand_to(r, c, nr, nc):
                continue
                
            # Cost is 1 for same terrain, higher for transparent tiles
            cost = 1 if grid[nr][nc] == terrain_char else 2
            new_dist = d + cost
            
            if new_dist < dist[nr, nc]:
                dist[nr, nc] = new_dist
                owner[nr, nc] = fid
                heapq.heappush(pq, (new_dist, nr, nc, fid))
    
    # Only return ownership for actual terrain tiles, not transparent ones
    result = np.full((H, W), -1, dtype=np.int16)
    for r in range(H):
        for c in range(W):
            if grid[r][c] == terrain_char and owner[r, c] >= 0:
                result[r, c] = owner[r, c]
    
    return result

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

    # 2. Organize labels by terrain type
    H, W = len(clean_grid), len(clean_grid[0]) if clean_grid else 0
    geo_id_grid = np.full((H,W), -1, dtype=np.int16)

    feature_names : List[str] = []
    seed_rows     : List[int] = []
    seed_cols     : List[int] = []
    
    # Group labels by terrain type
    terrain_to_labels : Dict[str, List[Dict[str,Any]]] = {}
    for lbl in labels:
        terrain = lbl['terrain']
        if terrain is None:
            continue
        if terrain not in terrain_to_labels:
            terrain_to_labels[terrain] = []
        terrain_to_labels[terrain].append(lbl)
    
    # 3. Process each terrain type with multi-source Dijkstra
    next_feature_id = 0
    
    for terrain_char in TERRAIN_FEATURE_CHARS:
        if terrain_char not in terrain_to_labels:
            continue
            
        # Create seeds for this terrain type
        seeds = []
        terrain_labels = terrain_to_labels[terrain_char]
        
        for lbl in terrain_labels:
            if lbl['type'] == 'embedded':
                seed_r, seed_c = lbl['row'], lbl['col']
            else:
                # adjacent label - use the found terrain position
                seed_r, seed_c = lbl.get('component_seed', (None, None))
                if seed_r is None:
                    continue
            
            # Assign feature ID and record
            fid = next_feature_id
            next_feature_id += 1
            
            feature_names.append(lbl['text'])
            seed_rows.append(seed_r)
            seed_cols.append(seed_c)
            
            seeds.append((seed_r, seed_c, fid))
        
        # Run multi-source Dijkstra for this terrain type
        if seeds:
            terrain_owner = _multi_source_dijkstra(clean_grid, seeds, terrain_char)
            
            # Merge into main geo_id_grid
            for r in range(H):
                for c in range(W):
                    if terrain_owner[r, c] >= 0:
                        geo_id_grid[r, c] = terrain_owner[r, c]

    return clean_grid, geo_id_grid, feature_names, seed_rows, seed_cols