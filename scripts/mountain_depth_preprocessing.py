#!/usr/bin/env python3
"""
Calculate mountain depth for each tile in the worldmap.
Mountain depth = minimum distance from a mountain tile to the nearest non-mountain tile.
"""
import os, sys, numpy as np, struct
from collections import deque

def load_map(map_path):
    """Load the ASCII map file."""
    if not os.path.exists(map_path):
        raise FileNotFoundError(f"Map file not found: {map_path}")
    
    with open(map_path, 'r', encoding='utf-8') as f:
        lines = [ln.rstrip('\n') for ln in f]
    H = len(lines)
    W = max(len(ln) for ln in lines) if lines else 0
    grid = [list(ln.ljust(W)) for ln in lines]
    return grid, H, W

def restore_terrain_under_labels(grid, H, W):
    """
    Restore terrain under annotation labels.
    Annotations are [Name], (Name), !Name, ?Name, or bare names in terrain.
    We need to infer what terrain should be under the text.
    """
    restored_grid = [row[:] for row in grid]
    
    # Process each row looking for annotations
    for r in range(H):
        c = 0
        while c < W:
            ch = grid[r][c]
            
            # Check for bracketed annotations [Name] or (Name)
            if ch in '[(':
                close = ']' if ch == '[' else ')'
                start_c = c
                c += 1
                # Find the closing bracket
                while c < W and grid[r][c] != close:
                    c += 1
                if c < W:
                    c += 1  # Include closing bracket
                    
                # Now infer terrain for this region
                terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                for i in range(start_c, c):
                    restored_grid[r][i] = terrain
                continue
            
            # Check for ! or ? prefixed names
            elif ch in '!?':
                start_c = c
                c += 1
                # Read the name
                while c < W and grid[r][c] not in ' .,-|=^&%~+@[]()!?':
                    c += 1
                    
                # Infer terrain
                terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                for i in range(start_c, c):
                    restored_grid[r][i] = terrain
                continue
            
            # Check for bare text labels (like Blue_Mts)
            elif ch.isalpha() or ch == '_':
                start_c = c
                # Read the whole label
                while c < W and (grid[r][c].isalpha() or grid[r][c] in '_\''):
                    c += 1
                    
                # Only process if it's a substantial label (3+ chars)
                if c - start_c >= 3:
                    terrain = infer_terrain_for_region(grid, H, W, r, start_c, c)
                    for i in range(start_c, c):
                        restored_grid[r][i] = terrain
                continue
                
            c += 1
    
    return restored_grid

def infer_terrain_for_region(grid, H, W, row, start_col, end_col):
    """
    Infer what terrain should be under a label by looking at surrounding tiles.
    """
    # Look for terrain in surrounding area
    terrain_counts = {}
    
    # Check tiles around the label
    for dr in [-1, 0, 1]:
        for dc in [-1, 1]:  # Just before and after the label
            for c in [start_col + dc, end_col + dc - 1]:
                r = row + dr
                if 0 <= r < H and 0 <= c < W:
                    ch = grid[r][c]
                    # Only count actual terrain characters
                    if ch in '^&%.,-|=~+ ' and not (ch.isalpha() or ch in '_\'[]()!?'):
                        terrain_counts[ch] = terrain_counts.get(ch, 0) + 1
    
    # If we found terrain, use the most common one
    if terrain_counts:
        # Special handling for mountains - if any mountain is nearby, it's probably mountains
        if '^' in terrain_counts:
            return '^'
        # Otherwise use most common
        return max(terrain_counts.items(), key=lambda x: x[1])[0]
    
    # Default fallback based on common patterns
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
    
    # Default to clear terrain
    return ' '

def calculate_mountain_depths_bfs(grid, H, W):
    """
    Calculate distance from each mountain tile to nearest non-mountain using BFS.
    This gives us the "depth" of how far inside a mountain range each tile is.
    """
    # Initialize depth grid
    depth_grid = np.zeros((H, W), dtype=np.uint8)
    
    # Queue for BFS: (row, col, distance)
    queue = deque()
    visited = set()
    
    # Find all non-mountain tiles and add them as starting points
    for r in range(H):
        for c in range(W):
            if grid[r][c] != '^':
                queue.append((r, c, 0))
                visited.add((r, c))
    
    # BFS to calculate distances
    directions = [(0, 1), (1, 0), (0, -1), (-1, 0)]
    
    while queue:
        r, c, dist = queue.popleft()
        
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            
            if 0 <= nr < H and 0 <= nc < W and (nr, nc) not in visited:
                visited.add((nr, nc))
                new_dist = dist + 1
                
                # If this is a mountain tile, record its depth
                if grid[nr][nc] == '^':
                    depth_grid[nr, nc] = min(new_dist, 255)  # Cap at 255 for uint8
                    queue.append((nr, nc, new_dist))
    
    return depth_grid

def write_depth_file(output_path, depth_grid, W, H):
    """Write the mountain depth data to a binary file."""
    with open(output_path, 'wb') as f:
        # Header
        f.write(b'MDEP')  # Magic number for Mountain Depth
        f.write(struct.pack('HHH', 1, W, H))  # Version, Width, Height
        
        # Write depth data
        for r in range(H):
            for c in range(W):
                f.write(struct.pack('B', depth_grid[r, c]))
    
    print(f"Mountain depth data written to: {output_path}")
    print(f"Map size: {W}x{H}")
    
    # Report statistics
    mountain_tiles = np.count_nonzero(depth_grid)
    if mountain_tiles > 0:
        max_depth = np.max(depth_grid)
        deep_mountains = np.count_nonzero(depth_grid >= 4)
        print(f"Mountain tiles: {mountain_tiles}")
        print(f"Maximum depth: {max_depth}")
        print(f"Deep mountain tiles (4+ spaces): {deep_mountains} ({deep_mountains/mountain_tiles*100:.1f}%)")

def main():
    if len(sys.argv) != 3:
        print("Usage: python mountain_depth_preprocessing.py <input_map> <output_depth_file>")
        sys.exit(1)
    
    input_map = sys.argv[1]
    output_file = sys.argv[2]
    
    # Load map
    grid, H, W = load_map(input_map)
    
    # Restore terrain under labels
    restored_grid = restore_terrain_under_labels(grid, H, W)
    
    # Calculate depths using restored grid
    depth_grid = calculate_mountain_depths_bfs(restored_grid, H, W)
    
    # Write output
    write_depth_file(output_file, depth_grid, W, H)

if __name__ == "__main__":
    main()