#!/usr/bin/env python3
import os, sys, struct
from collections import deque

sys.path.insert(0, os.path.dirname(__file__))
from forest_depth_preprocessing import load_map, restore_terrain_under_labels

RIVER_CHARS = set('-|+')
DIRS4 = [(0, 1), (1, 0), (0, -1), (-1, 0)]


def find_river_tiles(grid, H, W):
    """Return set of (r, c) for all river tiles."""
    tiles = set()
    for r in range(H):
        for c in range(W):
            if grid[r][c] in RIVER_CHARS:
                tiles.add((r, c))
    return tiles


def build_components(river_tiles, H, W):
    """Group river tiles into connected components (4-connected).
    Returns list of sets, each set is a component of (r, c) tuples."""
    visited = set()
    components = []
    for tile in river_tiles:
        if tile in visited:
            continue
        component = set()
        queue = deque([tile])
        visited.add(tile)
        while queue:
            r, c = queue.popleft()
            component.add((r, c))
            for dr, dc in DIRS4:
                nr, nc = r + dr, c + dc
                if (nr, nc) in river_tiles and (nr, nc) not in visited:
                    visited.add((nr, nc))
                    queue.append((nr, nc))
        components.append(component)
    return components


def check_ocean_connectivity(grid, H, W, components):
    """Flag components that don't touch ocean. Print 30x30 diagnostic."""
    for i, comp in enumerate(components):
        touches_ocean = False
        nearest_to_ocean = None
        min_ocean_dist = float('inf')

        for r, c in comp:
            for dr, dc in DIRS4:
                nr, nc = r + dr, c + dc
                if 0 <= nr < H and 0 <= nc < W and grid[nr][nc] == '=':
                    touches_ocean = True
                    break
            if touches_ocean:
                break

        if not touches_ocean:
            for r, c in comp:
                for or_ in range(H):
                    for oc in range(W):
                        if grid[or_][oc] == '=':
                            dist = abs(r - or_) + abs(c - oc)
                            if dist < min_ocean_dist:
                                min_ocean_dist = dist
                                nearest_to_ocean = (r, c)

            print(f"\nWARNING: Component {i+1} ({len(comp)} tiles) does NOT reach ocean!")
            print(f"  Nearest tile to ocean: ({nearest_to_ocean[1]}, {nearest_to_ocean[0]}), distance: {min_ocean_dist}")
            cr, cc = nearest_to_ocean
            r_start = max(0, cr - 15)
            r_end = min(H, cr + 15)
            c_start = max(0, cc - 15)
            c_end = min(W, cc + 15)
            print(f"  30x30 map context around ({cc}, {cr}):")
            for r in range(r_start, r_end):
                line = ''.join(grid[r][c_start:c_end])
                marker = ' <--' if r == cr else ''
                print(f"    {line}{marker}")
        else:
            print(f"  Component {i+1}: {len(comp)} tiles, reaches ocean: YES")


def get_river_neighbors(r, c, river_tiles):
    """Return list of (r, c) river neighbors (4-connected)."""
    neighbors = []
    for dr, dc in DIRS4:
        nr, nc = r + dr, c + dc
        if (nr, nc) in river_tiles:
            neighbors.append((nr, nc))
    return neighbors


def compute_flow(river_tiles, components, grid, H, W):
    """Compute accumulated flow for each river tile.

    Algorithm:
    1. Find sources (tiles with exactly 1 river neighbor).
    2. For tiles touching ocean, mark them as sinks.
    3. Topological trace from sources toward sinks, accumulating flow.
    4. At junctions: downstream flow = sum of upstream flows.
    """
    flow = {}

    for comp in components:
        sources = []
        for tile in comp:
            neighbors = get_river_neighbors(tile[0], tile[1], river_tiles)
            if len(neighbors) == 1:
                sources.append(tile)

        if not sources:
            for tile in comp:
                flow[tile] = 1
            continue

        in_flow = {tile: 0 for tile in comp}
        in_count = {tile: 0 for tile in comp}
        upstream_count = {}

        dist_from_source = {}
        queue = deque()
        for s in sources:
            dist_from_source[s] = 0
            queue.append(s)

        while queue:
            r, c = queue.popleft()
            for nr, nc in get_river_neighbors(r, c, comp):
                if (nr, nc) not in dist_from_source:
                    dist_from_source[(nr, nc)] = dist_from_source[(r, c)] + 1
                    queue.append((nr, nc))

        for tile in comp:
            r, c = tile
            neighbors = get_river_neighbors(r, c, comp)
            up = sum(1 for n in neighbors if dist_from_source.get(n, 0) < dist_from_source.get(tile, 0))
            upstream_count[tile] = up

        queue = deque()
        for tile in comp:
            if upstream_count[tile] == 0:
                flow[tile] = 1
                queue.append(tile)

        while queue:
            tile = queue.popleft()
            r, c = tile
            neighbors = get_river_neighbors(r, c, comp)
            for n in neighbors:
                if dist_from_source.get(n, 0) > dist_from_source.get(tile, 0):
                    in_flow[n] = in_flow.get(n, 0) + flow[tile]
                    in_count[n] = in_count.get(n, 0) + 1
                    if in_count[n] >= upstream_count[n]:
                        flow[n] = in_flow[n] + 1
                        queue.append(n)

    return flow


def write_rflw(output_path, W, H, components, flow):
    """Write RFLW binary format."""
    tile_component = {}
    for i, comp in enumerate(components):
        for tile in comp:
            tile_component[tile] = i + 1

    max_flows = []
    for comp in components:
        mf = max(flow.get(tile, 1) for tile in comp)
        max_flows.append(mf)

    with open(output_path, 'wb') as f:
        f.write(b'RFLW')
        f.write(struct.pack('<HHH', 1, W, H))

        for r in range(H):
            for c in range(W):
                tile = (r, c)
                if tile in tile_component:
                    cid = tile_component[tile]
                    fl = flow.get(tile, 1)
                    f.write(struct.pack('<BH', cid, fl))
                else:
                    f.write(struct.pack('<BH', 0, 0))

        f.write(struct.pack('B', len(components)))
        for mf in max_flows:
            f.write(struct.pack('<H', mf))

    total_river = sum(len(c) for c in components)
    print(f"\nRiver flow data written to: {output_path}")
    print(f"Map size: {W}x{H}")
    print(f"River tiles: {total_river}")
    print(f"Components: {len(components)}")
    for i, comp in enumerate(components):
        print(f"  Component {i+1}: {len(comp)} tiles, max flow: {max_flows[i]}")


def main():
    if len(sys.argv) != 3:
        print("Usage: python river_flow_preprocessing.py <input_map> <output_flow_file>")
        sys.exit(1)

    input_map = sys.argv[1]
    output_file = sys.argv[2]

    grid, H, W = load_map(input_map)
    restored = restore_terrain_under_labels(grid, H, W)

    river_tiles = find_river_tiles(restored, H, W)
    print(f"Found {len(river_tiles)} river tiles")

    components = build_components(river_tiles, H, W)
    print(f"Found {len(components)} connected components")

    print("\nOcean connectivity check:")
    check_ocean_connectivity(restored, H, W, components)

    flow = compute_flow(river_tiles, components, restored, H, W)

    write_rflw(output_file, W, H, components, flow)


if __name__ == "__main__":
    main()
