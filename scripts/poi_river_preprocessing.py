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
import collections, numpy as np, heapq
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
