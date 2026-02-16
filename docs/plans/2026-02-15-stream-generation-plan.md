# Stream Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate rivers and streams at local tile scale, with width derived from accumulated flow computed during preprocessing.

**Architecture:** New Python preprocessing script traces river topology and computes accumulated flow (summing at tributary merges). New TypeScript loader reads the binary. LocalMapGenerator overlays stream paths on top of the existing forest output, using midpoint displacement for natural meander and sqrt-scaled width.

**Tech Stack:** Python 3 (preprocessing), TypeScript/ESM (runtime), Vite (dev server), simplex-noise (existing dependency)

---

### Task 1: River Flow Preprocessing Script

**Files:**
- Create: `scripts/river_flow_preprocessing.py`

**Step 1: Write the preprocessing script**

This script:
1. Loads the world map (reusing `load_map` and `restore_terrain_under_labels` from `forest_depth_preprocessing.py`).
2. Finds all river tiles (`-`, `|`, `+`) on the restored grid.
3. Groups them into connected components via 4-connected flood fill.
4. Runs the ocean-connectivity diagnostic.
5. Computes accumulated flow via topological trace from sources.
6. Writes the RFLW binary format.

```python
#!/usr/bin/env python3
import os, sys, struct
from collections import deque

# Import shared utilities from forest preprocessing
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
            # Find the component tile nearest to any ocean tile
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
            # Print 30x30 context
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
    flow = {}  # (r, c) -> accumulated flow value

    for comp in components:
        # Find sources: tiles with exactly 1 river neighbor
        sources = []
        for tile in comp:
            neighbors = get_river_neighbors(tile[0], tile[1], river_tiles)
            if len(neighbors) == 1:
                sources.append(tile)

        if not sources:
            # Cycle with no clear source — assign flow=1 to all
            for tile in comp:
                flow[tile] = 1
            continue

        # BFS from sources, tracking "upstream flow" at each tile
        # Each source starts with flow=1
        # At merges, accumulate
        in_flow = {tile: 0 for tile in comp}  # sum of incoming flows
        in_count = {tile: 0 for tile in comp}  # number of upstream neighbors processed
        upstream_count = {}  # how many neighbors are "upstream" of this tile

        # Determine upstream vs downstream: sources have 0 upstream neighbors
        # For other tiles: upstream neighbors are those closer to a source
        # We use BFS distance from sources to determine direction

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

        # For each tile, upstream neighbors are those with lower dist_from_source
        for tile in comp:
            r, c = tile
            neighbors = get_river_neighbors(r, c, comp)
            up = sum(1 for n in neighbors if dist_from_source.get(n, 0) < dist_from_source.get(tile, 0))
            upstream_count[tile] = up

        # Topological processing: start with tiles that have no upstream (sources)
        queue = deque()
        for tile in comp:
            if upstream_count[tile] == 0:
                flow[tile] = 1
                queue.append(tile)

        while queue:
            tile = queue.popleft()
            r, c = tile
            neighbors = get_river_neighbors(r, c, comp)
            # Downstream neighbors have higher dist_from_source
            for n in neighbors:
                if dist_from_source.get(n, 0) > dist_from_source.get(tile, 0):
                    in_flow[n] = in_flow.get(n, 0) + flow[tile]
                    in_count[n] = in_count.get(n, 0) + 1
                    if in_count[n] >= upstream_count[n]:
                        flow[n] = in_flow[n] + 1  # +1 for this tile's own contribution
                        queue.append(n)

    return flow


def write_rflw(output_path, W, H, components, flow):
    """Write RFLW binary format."""
    # Build per-tile data
    tile_component = {}  # (r, c) -> component_id (1-based)
    for i, comp in enumerate(components):
        for tile in comp:
            tile_component[tile] = i + 1

    # Compute max flow per component
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

        # Component table
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
```

**Step 2: Run it and verify output**

Run: `python3 scripts/river_flow_preprocessing.py maps/middle_earth.worldmap maps/middle_earth_river_flow.bin`

Expected: diagnostic output showing components, ocean connectivity warnings, and binary file written. Review the ocean-disconnect warnings and fix the world map if needed.

**Step 3: Add npm script**

In `package.json`, add to scripts:
```json
"preprocess-rivers": "python3 scripts/river_flow_preprocessing.py maps/middle_earth.worldmap maps/middle_earth_river_flow.bin",
```

Update the `preprocess` script to include it:
```json
"preprocess": "npm run preprocess-map && npm run preprocess-mountains && npm run preprocess-forests && npm run preprocess-rivers",
```

**Step 4: Commit**

```bash
git add scripts/river_flow_preprocessing.py maps/middle_earth_river_flow.bin package.json
git commit -m "feat: add river flow preprocessing with topological trace"
```

---

### Task 2: TypeScript River Flow Data Loader

**Files:**
- Create: `src/core/data/RiverFlowData.ts`

**Step 1: Write the data loader**

Follow the exact pattern from `src/core/data/ForestData.ts`:

```typescript
import type { DataLoader } from '../../shared/DataLoader.js';

export class RiverFlowData {
  private width: number = 0;
  private height: number = 0;
  private componentGrid: Uint8Array | null = null;
  private flowGrid: Uint16Array | null = null;
  private maxFlows: number[] = [];

  constructor(private loader: DataLoader) {}

  async loadFromFile(filename: string): Promise<void> {
    try {
      const buffer = await this.loader.loadBinaryFile(filename);
      this.parseBinary(new Uint8Array(buffer));
    } catch (error) {
      throw new Error(`RiverFlowData.loadFromFile failed: ${error}\n  at src/core/data/RiverFlowData.ts:14`);
    }
  }

  private parseBinary(buffer: Uint8Array): void {
    let offset = 0;

    const magic = String.fromCharCode(...buffer.slice(0, 4));
    if (magic !== 'RFLW') {
      throw new Error(`Invalid river flow file. Expected 'RFLW', got '${magic}'\n  at src/core/data/RiverFlowData.ts:22`);
    }
    offset += 4;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true);
    offset += 2;
    if (version !== 1) {
      throw new Error(`Unsupported river flow version: ${version}\n  at src/core/data/RiverFlowData.ts:30`);
    }
    this.width = view.getUint16(offset, true);
    offset += 2;
    this.height = view.getUint16(offset, true);
    offset += 2;

    const gridSize = this.width * this.height;
    this.componentGrid = new Uint8Array(gridSize);
    this.flowGrid = new Uint16Array(gridSize);

    for (let i = 0; i < gridSize; i++) {
      this.componentGrid[i] = buffer[offset];
      offset += 1;
      this.flowGrid[i] = view.getUint16(offset, true);
      offset += 2;
    }

    const componentCount = buffer[offset];
    offset += 1;
    this.maxFlows = [];
    for (let i = 0; i < componentCount; i++) {
      this.maxFlows.push(view.getUint16(offset, true));
      offset += 2;
    }
  }

  isRiver(x: number, y: number): boolean {
    if (!this.componentGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.componentGrid[y * this.width + x] !== 0;
  }

  getFlow(x: number, y: number): { componentId: number; flow: number; maxFlow: number } | null {
    if (!this.componentGrid || !this.flowGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const idx = y * this.width + x;
    const cid = this.componentGrid[idx];
    if (cid === 0) return null;
    return {
      componentId: cid,
      flow: this.flowGrid[idx],
      maxFlow: this.maxFlows[cid - 1] || 1,
    };
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/core/data/RiverFlowData.ts
git commit -m "feat: add RiverFlowData TypeScript loader for RFLW binary"
```

---

### Task 3: Integrate RiverFlowData into WebGame

**Files:**
- Modify: `src/web/WebGame.tsx`

**Step 1: Add import and state**

At `src/web/WebGame.tsx:11` (after ForestData import), add:
```typescript
import { RiverFlowData } from '../core/data/RiverFlowData.js';
```

At line 44 (after forestData state), add:
```typescript
const [riverFlowData] = useState(() => new RiverFlowData(dataLoader));
```

**Step 2: Load the binary file**

At line 200 (after `forestData.loadFromFile`), add:
```typescript
await riverFlowData.loadFromFile('middle_earth_river_flow.bin');
```

**Step 3: Pass to LocalMapGenerator**

At line 202, change:
```typescript
const localGenerator = new LocalMapGenerator(mapData, forestData, 42);
```
to:
```typescript
const localGenerator = new LocalMapGenerator(mapData, forestData, riverFlowData, 42);
```

**Step 4: Verify it compiles (will fail until Task 4)**

This will not compile yet because `LocalMapGenerator` doesn't accept `riverFlowData` yet. That's fine — Task 4 handles it.

**Step 5: Commit**

```bash
git add src/web/WebGame.tsx
git commit -m "feat: integrate RiverFlowData loading into WebGame"
```

---

### Task 4: Add Stream Overlay to LocalMapGenerator

**Files:**
- Modify: `src/core/local/LocalMapGenerator.ts`

This is the core task. Adds stream generation as a post-processing step after forest generation.

**Step 1: Update constructor to accept RiverFlowData**

At the top of `LocalMapGenerator.ts`, add import:
```typescript
import { RiverFlowData } from '../data/RiverFlowData.js';
```

Change the constructor (line 34-42) to accept `riverFlowData`:
```typescript
constructor(
  private mapData: MapData,
  private forestData: ForestData,
  private riverFlowData: RiverFlowData,
  seed: number
) {
```

**Step 2: Add the overlay call in generateTile**

After `this.trimBorder(work)` at line 52, before `return`, add the stream overlay:
```typescript
generateTile(wx: number, wy: number): string[][] {
  const densityGrid = this.buildDensityGrid(wx, wy);
  const work = this.generateNoiseGrid(wx, wy, densityGrid);
  this.applyCellularAutomata(work, 3, mulberry32(wx * 4517 + wy * 7727 + 12345));
  this.applyDiffusion(work, wx, wy);
  this.capDensity(work, 0.85, wx, wy);
  this.carveTrails(work, wx, wy);
  this.applyClumping(work, 2, wx, wy);
  const result = this.trimBorder(work);
  this.overlayStreams(result, wx, wy);  // NEW
  return result;
}
```

**Step 3: Implement helper methods**

Add these private methods to `LocalMapGenerator`:

```typescript
private hashCoord(a: number, b: number, c: number, d: number): number {
  let h = a * 374761393 + b * 668265263 + c * 1274126177 + d;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return Math.abs(h);
}

private getCrossingPoint(wx1: number, wy1: number, wx2: number, wy2: number, seed: number): number {
  const h = this.hashCoord(
    Math.min(wx1, wx2), Math.max(wx1, wx2),
    Math.min(wy1, wy2), Math.max(wy1, wy2) + seed
  );
  return (h % 33) + 5;  // Range [5, 37]
}

private computeLocalWidth(wx: number, wy: number): number {
  const flowInfo = this.riverFlowData.getFlow(wx, wy);
  if (!flowInfo) return 1;
  const normalized = flowInfo.flow / flowInfo.maxFlow;
  return Math.max(1, Math.round(Math.sqrt(normalized) * 20));
}

private getStreamEntryExitPoints(wx: number, wy: number): Array<{ x: number; y: number; side: string }> {
  const points: Array<{ x: number; y: number; side: string }> = [];
  const RIVER_SEED = 99997;

  // Check each cardinal neighbor for river tiles
  const neighbors: Array<{ dx: number; dy: number; side: string }> = [
    { dx: 0, dy: -1, side: 'north' },
    { dx: 1, dy: 0, side: 'east' },
    { dx: 0, dy: 1, side: 'south' },
    { dx: -1, dy: 0, side: 'west' },
  ];

  for (const { dx, dy, side } of neighbors) {
    const nx = wx + dx;
    const ny = wy + dy;
    if (this.riverFlowData.isRiver(nx, ny)) {
      if (side === 'north' || side === 'south') {
        const cx = this.getCrossingPoint(wx, wy, nx, ny, RIVER_SEED);
        const cy = side === 'north' ? 0 : TILE_SIZE - 1;
        points.push({ x: cx, y: cy, side });
      } else {
        const cy = this.getCrossingPoint(wx, wy, nx, ny, RIVER_SEED);
        const cx = side === 'west' ? 0 : TILE_SIZE - 1;
        points.push({ x: cx, y: cy, side });
      }
    }
  }

  return points;
}

private midpointDisplace(
  points: Array<{ x: number; y: number }>,
  rng: () => number,
  amplitude: number,
  depth: number
): Array<{ x: number; y: number }> {
  if (depth <= 0 || points.length < 2) return points;

  const result: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) {
      result.push(b);
      continue;
    }
    // Perpendicular displacement
    const nx = -dy / len;
    const ny = dx / len;
    const disp = (rng() - 0.5) * amplitude;
    result.push({ x: mx + nx * disp, y: my + ny * disp });
    result.push(b);
  }

  return this.midpointDisplace(result, rng, amplitude * 0.5, depth - 1);
}

private rasterizePath(
  grid: string[][],
  path: Array<{ x: number; y: number }>,
  width: number
): void {
  const halfW = width / 2;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      // Stamp a circle of radius halfW
      const r = Math.ceil(halfW);
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox * ox + oy * oy <= halfW * halfW) {
            const px = Math.round(cx + ox);
            const py = Math.round(cy + oy);
            if (px >= 0 && px < TILE_SIZE && py >= 0 && py < TILE_SIZE) {
              grid[py][px] = '=';
            }
          }
        }
      }
    }
  }
}

private overlayStreams(grid: string[][], wx: number, wy: number): void {
  if (!this.riverFlowData.isRiver(wx, wy)) return;

  const width = this.computeLocalWidth(wx, wy);
  const points = this.getStreamEntryExitPoints(wx, wy);
  const rng = mulberry32(wx * 13337 + wy * 7919 + 42424);

  if (points.length === 0) {
    // Source tile — no river neighbors. Place a spring near center.
    const cx = 15 + Math.floor(rng() * 13);
    const cy = 15 + Math.floor(rng() * 13);
    const r = Math.max(1, Math.floor(width / 2));
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy <= r * r) {
          const px = cx + ox;
          const py = cy + oy;
          if (px >= 0 && px < TILE_SIZE && py >= 0 && py < TILE_SIZE) {
            grid[py][px] = '=';
          }
        }
      }
    }
    return;
  }

  if (points.length === 1) {
    // Dead end — stream from edge to a point inside the tile
    const entry = points[0];
    const cx = TILE_SIZE / 2 + (rng() - 0.5) * 10;
    const cy = TILE_SIZE / 2 + (rng() - 0.5) * 10;
    const amplitude = Math.max(3, 15 / Math.max(1, width));
    const path = this.midpointDisplace(
      [{ x: entry.x, y: entry.y }, { x: cx, y: cy }],
      rng, amplitude, 3
    );
    this.rasterizePath(grid, path, width);
    return;
  }

  // Multiple entry/exit points — find the main channel (highest flow neighbors)
  // Sort by flow of the neighbor tile (downstream = highest flow)
  const withFlow = points.map(p => {
    const dx = p.side === 'east' ? 1 : p.side === 'west' ? -1 : 0;
    const dy = p.side === 'south' ? 1 : p.side === 'north' ? -1 : 0;
    const nflow = this.riverFlowData.getFlow(wx + dx, wy + dy);
    return { ...p, neighborFlow: nflow ? nflow.flow : 0 };
  });
  withFlow.sort((a, b) => b.neighborFlow - a.neighborFlow);

  // Connect first two points as main channel
  const amplitude = Math.max(3, 15 / Math.max(1, width));
  const mainPath = this.midpointDisplace(
    [{ x: withFlow[0].x, y: withFlow[0].y }, { x: withFlow[1].x, y: withFlow[1].y }],
    rng, amplitude, 3
  );
  this.rasterizePath(grid, mainPath, width);

  // Connect remaining points as tributaries to the main channel midpoint
  for (let i = 2; i < withFlow.length; i++) {
    const p = withFlow[i];
    const mid = mainPath[Math.floor(mainPath.length / 2)];
    const nflow = this.riverFlowData.getFlow(wx + (p.side === 'east' ? 1 : p.side === 'west' ? -1 : 0),
                                              wy + (p.side === 'south' ? 1 : p.side === 'north' ? -1 : 0));
    const tribWidth = nflow ? Math.max(1, Math.round(Math.sqrt(nflow.flow / nflow.maxFlow) * 20)) : 1;
    const tribPath = this.midpointDisplace(
      [{ x: p.x, y: p.y }, { x: mid.x, y: mid.y }],
      rng, amplitude, 3
    );
    this.rasterizePath(grid, tribPath, tribWidth);
  }
}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/core/local/LocalMapGenerator.ts
git commit -m "feat: add stream overlay to LocalMapGenerator with midpoint displacement"
```

---

### Task 5: Visual Testing and Tuning

**Files:**
- No new files. Manual testing in browser.

**Step 1: Start the dev server**

Run: `npm start`

**Step 2: Test at known river locations**

In the browser:
1. Navigate to a river on the world map (e.g., the Brandywine near Hobbiton, or the Anduin).
2. Press `M` to enter local view.
3. Observe: does the stream appear? Is it the right width? Does it meander naturally?
4. Walk around — `=` should block movement (already handled by LocalMovementSystem).
5. Check seamlessness: walk across tile boundaries along a river. The stream should continue smoothly.

Key test locations:
- **Brandywine River** near Hobbiton (~145, 50): narrow stream, width ~2-3
- **Anduin** near Minas Tirith (~280, 90): wide river, width ~15-20
- **Tributary junction**: where a small stream meets the Anduin — should see width increase downstream

**Step 3: Report observations**

Tell the developer what you see. Likely tuning targets:
- Meander amplitude (the `15 / width` formula)
- Midpoint displacement recursion depth (currently 3)
- Width scaling (the `sqrt * 20` formula)
- Source tile spring size

**Step 4: Commit any tuning changes**

```bash
git add -A
git commit -m "feat: tune stream generation parameters"
```

---

### Task 6: Fix Disconnected Rivers (if any)

**Files:**
- Modify: `maps/middle_earth.worldmap` (if needed)

**Step 1: Review diagnostic output from Task 1**

Check the preprocessing output for `does NOT reach ocean` warnings.

**Step 2: For each disconnected river, view the 30x30 context**

The diagnostic shows the map area. Identify the missing connection.

**Step 3: Edit the world map to connect the river**

Fix the `maps/middle_earth.worldmap` file — add the missing `-`, `|`, or `+` characters.

**Step 4: Re-run preprocessing**

Run: `npm run preprocess`

**Step 5: Verify fix**

Run: `python3 scripts/river_flow_preprocessing.py maps/middle_earth.worldmap maps/middle_earth_river_flow.bin`

Confirm the warning is gone.

**Step 6: Commit**

```bash
git add maps/middle_earth.worldmap maps/middle_earth_river_flow.bin
git commit -m "fix: connect disconnected rivers in world map"
```
