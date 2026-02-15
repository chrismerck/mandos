#!/usr/bin/env python3
import os, sys, numpy as np, struct
from collections import deque

def load_map(map_path):
    if not os.path.exists(map_path):
        raise FileNotFoundError(f"Map file not found: {map_path}")

    with open(map_path, 'r', encoding='utf-8') as f:
        lines = [ln.rstrip('\n') for ln in f]
    H = len(lines)
    W = max(len(ln) for ln in lines) if lines else 0
    grid = [list(ln.ljust(W)) for ln in lines]
    return grid, H, W

def restore_terrain_under_labels(grid, H, W):
    restored_grid = [row[:] for row in grid]

    for r in range(H):
        c = 0
        while c < W:
            ch = grid[r][c]

            if ch in '[(':
                close = ']' if ch == '[' else ')'
                start_c = c
                c += 1
                while c < W and grid[r][c] != close:
                    c += 1
                if c < W:
                    c += 1

                terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                for i in range(start_c, c):
                    restored_grid[r][i] = terrain
                continue

            elif ch in '!?':
                start_c = c
                c += 1
                while c < W and grid[r][c] not in ' .,-|=^&%~+@[]()!?':
                    c += 1

                terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                for i in range(start_c, c):
                    restored_grid[r][i] = terrain
                continue

            elif ch.isalpha() or ch == '_':
                start_c = c
                while c < W and (grid[r][c].isalpha() or grid[r][c] in '_\''):
                    c += 1

                if c - start_c >= 3:
                    terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                    for i in range(start_c, c):
                        restored_grid[r][i] = terrain
                continue

            c += 1

    return restored_grid

def infer_terrain_for_region(grid, H, W, row, start_col, end_col):
    terrain_counts = {}

    for dr in [-1, 0, 1]:
        for dc in [-1, 1]:
            for c in [start_col + dc, end_col + dc - 1]:
                r = row + dr
                if 0 <= r < H and 0 <= c < W:
                    ch = grid[r][c]
                    if ch in '^&%.,-|=~+ ' and not (ch.isalpha() or ch in '_\'[]()!?'):
                        terrain_counts[ch] = terrain_counts.get(ch, 0) + 1

    if terrain_counts:
        if '^' in terrain_counts:
            return '^'
        return max(terrain_counts.items(), key=lambda x: x[1])[0]

    label_text = ''.join(grid[row][start_col:end_col]).lower()
    if 'mt' in label_text or 'mountain' in label_text or 'peak' in label_text:
        return '^'
    elif 'forest' in label_text or 'wood' in label_text:
        return '&'
    elif 'marsh' in label_text or 'swamp' in label_text:
        return '%'
    elif 'river' in label_text:
        return '-'
    elif 'sea' in label_text or 'ocean' in label_text:
        return '='

    return ' '

def calculate_forest_depths_bfs(grid, H, W):
    depth_grid = np.zeros((H, W), dtype=np.uint8)
    open_terrain = set(' .,%o~')

    queue = deque()
    visited = set()

    for r in range(H):
        for c in range(W):
            if grid[r][c] in open_terrain:
                queue.append((r, c, 0))
                visited.add((r, c))

    directions = [(0, 1), (1, 0), (0, -1), (-1, 0)]

    while queue:
        r, c, dist = queue.popleft()

        for dr, dc in directions:
            nr, nc = r + dr, c + dc

            if 0 <= nr < H and 0 <= nc < W and (nr, nc) not in visited:
                visited.add((nr, nc))
                new_dist = dist + 1

                if grid[nr][nc] == '&':
                    depth_grid[nr, nc] = min(new_dist, 255)
                    queue.append((nr, nc, new_dist))

    return depth_grid

def write_depth_file(output_path, depth_grid, W, H):
    with open(output_path, 'wb') as f:
        f.write(b'FDEP')
        f.write(struct.pack('HHH', 1, W, H))

        for r in range(H):
            for c in range(W):
                f.write(struct.pack('B', depth_grid[r, c]))

    print(f"Forest depth data written to: {output_path}")
    print(f"Map size: {W}x{H}")

    forest_tiles = np.count_nonzero(depth_grid)
    if forest_tiles > 0:
        max_depth = np.max(depth_grid)
        deep_forests = np.count_nonzero(depth_grid >= 4)
        print(f"Forest tiles: {forest_tiles}")
        print(f"Maximum depth: {max_depth}")
        print(f"Deep forest tiles (4+ spaces): {deep_forests} ({deep_forests/forest_tiles*100:.1f}%)")

def main():
    if len(sys.argv) != 3:
        print("Usage: python forest_depth_preprocessing.py <input_map> <output_depth_file>")
        sys.exit(1)

    input_map = sys.argv[1]
    output_file = sys.argv[2]

    grid, H, W = load_map(input_map)

    restored_grid = restore_terrain_under_labels(grid, H, W)

    depth_grid = calculate_forest_depths_bfs(restored_grid, H, W)

    write_depth_file(output_file, depth_grid, W, H)

if __name__ == "__main__":
    main()
