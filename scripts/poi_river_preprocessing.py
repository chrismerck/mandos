#!/usr/bin/env python3
"""
Extracts POI (!Name) and river/road (@Name) annotations from the Middle Earth map.

POI labels: '!Name' near 'o' town markers — BFS from '!' to nearest 'o'.
River/road labels: '@Name' near river (|, -, +) or road (.) tiles — simultaneous
BFS determines type, then flood-fill claims connected tiles.

Returns:
    poi_grid    – H×W numpy.uint8 array, value = POI/river ID or 255 (none)
    poi_names   – list[str] giving the display name for each ID
"""
from __future__ import annotations
import collections, csv, os, numpy as np, heapq
from typing import List, Tuple, Dict, Any

LABEL_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'0123456789")
DIRS8 = [(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)]
DIRS4 = [(1,0), (-1,0), (0,1), (0,-1)]
RIVER_CHARS = {'|', '-', '+'}
ROAD_CHARS = {'.'}


def _is_label_char(ch: str) -> bool:
    return ch in LABEL_CHARS


def _scan_labels(grid: List[List[str]], prefix: str) -> List[Dict[str, Any]]:
    """Scan grid for labels starting with the given prefix character (! or @)."""
    H = len(grid)
    W = len(grid[0]) if grid else 0
    labels = []
    for r in range(H):
        c = 0
        while c < W:
            if grid[r][c] == prefix and c + 1 < W and _is_label_char(grid[r][c + 1]):
                start_c = c
                c += 1
                chars = []
                while c < W and _is_label_char(grid[r][c]):
                    chars.append(grid[r][c])
                    c += 1
                name = ''.join(chars)
                if name:
                    labels.append({
                        'name': name,
                        'row': r,
                        'col': start_c,
                    })
                continue
            c += 1
    return labels


def _assign_pois_simultaneous(grid: List[List[str]],
                               labels: List[Dict[str, Any]]) -> None:
    """
    Simultaneous BFS from all ! label positions (8-connected).
    The first 'o' tile each label's wavefront reaches is assigned to that label.
    Uses per-label seen sets so one label's expansion doesn't block another.
    Mutates each label dict to add 'town' key: (row, col) or None.
    """
    H = len(grid)
    W = len(grid[0]) if grid else 0
    q = collections.deque()
    seen_per_label: List[set] = []

    for i, lbl in enumerate(labels):
        r, c = lbl['row'], lbl['col']
        s = {(r, c)}
        seen_per_label.append(s)
        q.append((r, c, i))

    claimed_towns: set = set()

    while q:
        r, c, idx = q.popleft()
        lbl = labels[idx]
        if 'town' in lbl:
            continue

        if grid[r][c] == 'o' and (r, c) not in claimed_towns:
            lbl['town'] = (r, c)
            claimed_towns.add((r, c))
            continue

        for dr, dc in DIRS8:
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and (nr, nc) not in seen_per_label[idx]:
                seen_per_label[idx].add((nr, nc))
                q.append((nr, nc, idx))

    for lbl in labels:
        if 'town' not in lbl:
            lbl['town'] = None


def _classify_at_labels(grid: List[List[str]], labels: List[Dict[str, Any]]) -> None:
    """
    Simultaneous BFS from all @ label positions.
    The first river (|, -, +) or road (.) tile each label reaches
    determines whether it's a 'river' or 'road'.
    Mutates each label dict to add 'type' and 'seed' keys.
    """
    H = len(grid)
    W = len(grid[0]) if grid else 0
    label_map = {}
    q = collections.deque()
    seen = set()

    for i, lbl in enumerate(labels):
        r, c = lbl['row'], lbl['col']
        seen.add((r, c))
        label_map[(r, c)] = i
        q.append((r, c, i))

    while q:
        r, c, idx = q.popleft()
        lbl = labels[idx]
        if 'type' in lbl:
            continue

        ch = grid[r][c]
        if ch in RIVER_CHARS:
            lbl['type'] = 'river'
            lbl['seed'] = (r, c)
            continue
        if ch in ROAD_CHARS:
            lbl['type'] = 'road'
            lbl['seed'] = (r, c)
            continue

        for dr, dc in DIRS8:
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and (nr, nc) not in seen:
                seen.add((nr, nc))
                q.append((nr, nc, idx))

    for lbl in labels:
        if 'type' not in lbl:
            lbl['type'] = None
            lbl['seed'] = None


def _flood_fill_from_seeds(grid: List[List[str]], labels: List[Dict[str, Any]],
                           poi_grid: np.ndarray, next_id: int) -> Tuple[List[str], int]:
    """
    Multi-source flood-fill: each classified @-label floods along connected
    tiles of its type (river or road). Uses simultaneous BFS so when two
    named features collide, first-come-first-served.

    Returns (names_added, next_id_after).
    """
    H = len(grid)
    W = len(grid[0]) if grid else 0
    names = []
    q = collections.deque()

    for lbl in labels:
        if lbl['seed'] is None:
            continue
        fid = next_id + len(names)
        lbl['fid'] = fid
        names.append(lbl['name'])
        sr, sc = lbl['seed']
        if poi_grid[sr, sc] == 255:
            poi_grid[sr, sc] = fid
            q.append((sr, sc, fid, lbl['type']))

    while q:
        r, c, fid, ftype = q.popleft()
        target_chars = RIVER_CHARS if ftype == 'river' else ROAD_CHARS
        for dr, dc in DIRS4:
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and poi_grid[nr, nc] == 255:
                ch = grid[nr][nc]
                if ch in target_chars:
                    poi_grid[nr, nc] = fid
                    q.append((nr, nc, fid, ftype))

    return names, next_id + len(names)


def _clean_labels_from_grid(grid: List[List[str]]) -> List[List[str]]:
    """Return a deep copy of grid with all !Name, ?Name, @Name labels replaced by spaces."""
    H = len(grid)
    W = len(grid[0]) if grid else 0
    clean = [row[:] for row in grid]
    for r in range(H):
        c = 0
        while c < W:
            ch = clean[r][c]
            if ch in ('!', '?', '@') and c + 1 < W and _is_label_char(clean[r][c + 1]):
                clean[r][c] = ' '
                c += 1
                while c < W and _is_label_char(clean[r][c]):
                    clean[r][c] = ' '
                    c += 1
                continue
            c += 1
    return clean


def _load_name_lookup(map_dir: str) -> Dict[str, str]:
    """Load poi_names.csv lookup table mapping abbreviated map labels to display names."""
    path = os.path.join(map_dir, 'poi_names.csv')
    lookup: Dict[str, str] = {}
    if os.path.exists(path):
        with open(path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                lookup[row['map_label']] = row['display_name']
    return lookup


def build_poi_river_grid(grid: List[List[str]], H: int, W: int,
                         map_dir: str = 'maps') -> Tuple[np.ndarray, List[str]]:
    """
    Main entrypoint. Scans grid for !Name and @Name labels,
    builds a per-tile POI/river ID grid.

    Returns:
        poi_grid  – H×W uint8 array (255 = no POI)
        poi_names – list of display names indexed by ID
    """
    poi_grid = np.full((H, W), 255, dtype=np.uint8)
    names: List[str] = []
    next_id = 0
    name_lookup = _load_name_lookup(map_dir)

    poi_labels = _scan_labels(grid, '!')
    at_labels = _scan_labels(grid, '@')
    clean = _clean_labels_from_grid(grid)

    # 1) POI labels: simultaneous BFS to assign each label its nearest 'o' tile
    _assign_pois_simultaneous(clean, poi_labels)
    for lbl in poi_labels:
        if lbl['town'] is not None:
            tr, tc = lbl['town']
            poi_grid[tr, tc] = next_id
            display_name = name_lookup.get(lbl['name'], lbl['name'])
            names.append(display_name)
            next_id += 1

    # 2) River/road labels: @Name -> flood-fill connected tiles
    _classify_at_labels(clean, at_labels)
    river_names, next_id = _flood_fill_from_seeds(clean, at_labels, poi_grid, next_id)
    for rn in river_names:
        names.append(name_lookup.get(rn, rn))

    return poi_grid, names


def write_poi_binary(path: str, poi_grid: np.ndarray, names: List[str], W: int, H: int) -> None:
    """Write POI1 format binary file."""
    import struct
    with open(path, 'wb') as f:
        f.write(b'POI1')
        f.write(struct.pack('<HHH', 1, W, H))
        f.write(poi_grid.ravel().tobytes())
        f.write(struct.pack('B', len(names)))
        for nm in names:
            b = nm.encode('utf-8')
            f.write(struct.pack('B', len(b)))
            f.write(b)
