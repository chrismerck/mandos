# Forest Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate local-scale forest terrain from the world map, with seamless noise-based generation, cellular automata smoothing, and a mode-switch between world map and local view.

**Architecture:** Each world map `&` tile expands into a 43x43 local grid. Simplex noise at global coordinates produces the base density field, modulated by bilinearly-interpolated forest depth. Two CA passes smooth into organic clumps. A 4-cell oversample border ensures seamless edges. The `M` key toggles between world and local views.

**Tech Stack:** TypeScript (ESM, .js imports), React 19, Vite, Jest + ts-jest, Python 3 (preprocessing), `simplex-noise` npm package.

**Design doc:** `docs/plans/2026-02-15-forest-generation-design.md`

---

### Task 1: Forest Depth Preprocessing Script

**Files:**
- Create: `scripts/forest_depth_preprocessing.py`
- Modify: `package.json` (add `preprocess-forests` script)

**Step 1: Write the preprocessing script**

Mirror `scripts/mountain_depth_preprocessing.py` but target `&` (forest) instead of `^` (mountain). Key differences:
- Magic number: `FDEP` instead of `MDEP`
- BFS from all non-`&` tiles
- Reuse `load_map()` and `restore_terrain_under_labels()` from mountain script (copy, don't import)

```python
#!/usr/bin/env python3
"""
Calculate forest depth for each tile in the worldmap.
Forest depth = minimum distance from a forest tile to the nearest non-forest tile.
"""
import os, sys, numpy as np, struct
from collections import deque

# Copy load_map() and restore_terrain_under_labels() from mountain_depth_preprocessing.py
# (same functions, no changes needed)

def calculate_forest_depths_bfs(grid, H, W):
    depth_grid = np.zeros((H, W), dtype=np.uint8)
    queue = deque()
    visited = set()

    for r in range(H):
        for c in range(W):
            if grid[r][c] != '&':
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
        print(f"Forest tiles: {forest_tiles}")
        print(f"Maximum depth: {max_depth}")

def main():
    if len(sys.argv) != 3:
        print("Usage: python forest_depth_preprocessing.py <input_map> <output_depth_file>")
        sys.exit(1)
    grid, H, W = load_map(sys.argv[1])
    restored_grid = restore_terrain_under_labels(grid, H, W)
    depth_grid = calculate_forest_depths_bfs(restored_grid, H, W)
    write_depth_file(sys.argv[2], depth_grid, W, H)

if __name__ == "__main__":
    main()
```

**Step 2: Add npm script to package.json**

Add to `"scripts"`:
```json
"preprocess-forests": "python3 scripts/forest_depth_preprocessing.py maps/middle_earth.worldmap maps/middle_earth_forests.bin"
```

Update `"preprocess"` to include it:
```json
"preprocess": "npm run preprocess-map && npm run preprocess-mountains && npm run preprocess-forests"
```

**Step 3: Run preprocessing**

Run: `npm run preprocess-forests`
Expected: `maps/middle_earth_forests.bin` created, prints forest tile count and max depth.

**Step 4: Commit**

```bash
git add scripts/forest_depth_preprocessing.py package.json maps/middle_earth_forests.bin
git commit -m "feat: add forest depth preprocessing script"
```

---

### Task 2: ForestData TypeScript Loader

**Files:**
- Create: `src/core/data/ForestData.ts`
- Create: `src/core/data/__tests__/ForestData.test.ts`

**Step 1: Write the failing test**

File: `src/core/data/__tests__/ForestData.test.ts`

```typescript
import { ForestData } from '../ForestData.js';

class MockForestData extends ForestData {
  loadFromBuffer(buffer: ArrayBuffer): void {
    this['parseBinaryGrid'](new Uint8Array(buffer));
  }
}

function createTestBuffer(): ArrayBuffer {
  // FDEP format: magic(4) + version(2) + width(2) + height(2) + data
  const width = 3;
  const height = 2;
  const buf = new ArrayBuffer(4 + 2 + 2 + 2 + width * height);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Magic: FDEP
  bytes[0] = 70; bytes[1] = 68; bytes[2] = 69; bytes[3] = 80;
  // Version: 1
  view.setUint16(4, 1, true);
  // Width: 3
  view.setUint16(6, 3, true);
  // Height: 2
  view.setUint16(8, 2, true);
  // Data: depths
  bytes[10] = 0; bytes[11] = 1; bytes[12] = 2;
  bytes[13] = 3; bytes[14] = 4; bytes[15] = 5;

  return buf;
}

describe('ForestData', () => {
  let forestData: MockForestData;

  beforeEach(() => {
    forestData = new MockForestData();
    forestData.loadFromBuffer(createTestBuffer());
  });

  test('should return correct depth values', () => {
    expect(forestData.getDepth(0, 0)).toBe(0);
    expect(forestData.getDepth(1, 0)).toBe(1);
    expect(forestData.getDepth(2, 1)).toBe(5);
  });

  test('should return 0 for out-of-bounds', () => {
    expect(forestData.getDepth(-1, 0)).toBe(0);
    expect(forestData.getDepth(3, 0)).toBe(0);
  });

  test('should identify deep forest', () => {
    expect(forestData.isDeepForest(2, 1)).toBe(true);  // depth 5
    expect(forestData.isDeepForest(1, 0)).toBe(false);  // depth 1
  });

  test('should identify edge forest', () => {
    expect(forestData.isEdgeForest(1, 0)).toBe(true);   // depth 1
    expect(forestData.isEdgeForest(0, 0)).toBe(false);  // depth 0
    expect(forestData.isEdgeForest(2, 1)).toBe(false);  // depth 5 (deep, not edge)
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/core/data/__tests__/ForestData.test.ts --no-cache`
Expected: FAIL — `ForestData` module not found.

**Step 3: Write the implementation**

File: `src/core/data/ForestData.ts`

Mirror `MountainData.ts` exactly, changing:
- Magic: `'FDEP'` instead of `'MDEP'`
- Method names: `isDeepForest` (depth >= 4), `isEdgeForest` (0 < depth < 4)
- Error messages: reference `ForestData`

```typescript
import type { DataLoader } from '../../shared/DataLoader.js';

export class ForestData {
  private width: number = 0;
  private height: number = 0;
  private depthGrid: Uint8Array | null = null;

  constructor(private loader?: DataLoader) {}

  async loadFromFile(depthFile: string): Promise<void> {
    if (!this.loader) throw new Error('No DataLoader provided');
    const buffer = await this.loader.loadBinaryFile(depthFile);
    this.parseBinaryGrid(new Uint8Array(buffer));
  }

  protected parseBinaryGrid(buffer: Uint8Array): void {
    let offset = 0;
    const magic = String.fromCharCode(...buffer.slice(0, 4));
    if (magic !== 'FDEP') {
      throw new Error(`Invalid forest depth format. Expected 'FDEP', got '${magic}'`);
    }
    offset += 4;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true); offset += 2;
    this.width = view.getUint16(offset, true); offset += 2;
    this.height = view.getUint16(offset, true); offset += 2;

    if (version !== 1) {
      throw new Error(`Unsupported forest depth version: ${version}`);
    }

    const gridSize = this.width * this.height;
    this.depthGrid = new Uint8Array(gridSize);
    for (let i = 0; i < gridSize; i++) {
      this.depthGrid[i] = buffer[offset + i];
    }
  }

  getDepth(x: number, y: number): number {
    if (!this.depthGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return 0;
    }
    return this.depthGrid[y * this.width + x];
  }

  isDeepForest(x: number, y: number): boolean {
    return this.getDepth(x, y) >= 4;
  }

  isEdgeForest(x: number, y: number): boolean {
    const depth = this.getDepth(x, y);
    return depth > 0 && depth < 4;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/core/data/__tests__/ForestData.test.ts --no-cache`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/core/data/ForestData.ts src/core/data/__tests__/ForestData.test.ts
git commit -m "feat: add ForestData loader for FDEP binary format"
```

---

### Task 3: Install Simplex Noise Library

**Files:**
- Modify: `package.json`

**Step 1: Install the simplex-noise package**

Run: `npm install simplex-noise`

This is a lightweight, zero-dependency 2D/3D/4D simplex noise implementation.

**Step 2: Verify it works**

Run: `node -e "import('simplex-noise').then(m => { const s = m.createNoise2D(); console.log(s(1.5, 2.5)); })"`
Expected: Prints a float between -1 and 1.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add simplex-noise dependency"
```

---

### Task 4: LocalMapGenerator — Core Generation Algorithm

**Files:**
- Create: `src/core/local/LocalMapGenerator.ts`
- Create: `src/core/local/ForestDensityConfig.ts`
- Create: `src/core/local/__tests__/LocalMapGenerator.test.ts`

**Step 1: Create the density configuration**

File: `src/core/local/ForestDensityConfig.ts`

```typescript
export interface DensityEntry {
  treeDensity: number;
  brambleMargin: number;
  herbMargin: number;
}

export const FOREST_DENSITY_CURVE: DensityEntry[] = [
  { treeDensity: 0.00, brambleMargin: 0.00, herbMargin: 0.00 },  // depth 0
  { treeDensity: 0.12, brambleMargin: 0.03, herbMargin: 0.05 },  // depth 1
  { treeDensity: 0.25, brambleMargin: 0.05, herbMargin: 0.06 },  // depth 2
  { treeDensity: 0.40, brambleMargin: 0.07, herbMargin: 0.06 },  // depth 3
  { treeDensity: 0.55, brambleMargin: 0.10, herbMargin: 0.05 },  // depth 4
  { treeDensity: 0.65, brambleMargin: 0.12, herbMargin: 0.04 },  // depth 5
  { treeDensity: 0.75, brambleMargin: 0.15, herbMargin: 0.03 },  // depth 6+
];

export function getDensityForDepth(depth: number): DensityEntry {
  const index = Math.min(depth, FOREST_DENSITY_CURVE.length - 1);
  return FOREST_DENSITY_CURVE[index];
}
```

**Step 2: Write the failing test**

File: `src/core/local/__tests__/LocalMapGenerator.test.ts`

```typescript
import { LocalMapGenerator } from '../LocalMapGenerator.js';
import { MapData } from '../../data/MapData.js';
import { ForestData } from '../../data/ForestData.js';

class MockMapData {
  width = 10;
  height = 10;
  private grid: string[][];

  constructor() {
    // 10x10 grid: forest in center, plains around edges
    this.grid = Array.from({ length: 10 }, () => Array(10).fill(' '));
    // Forest block at (3,3) to (6,6)
    for (let y = 3; y <= 6; y++) {
      for (let x = 3; x <= 6; x++) {
        this.grid[y][x] = '&';
      }
    }
  }

  getTile(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return ' ';
    return this.grid[y][x];
  }
}

class MockForestData {
  getDepth(x: number, y: number): number {
    // Inner tiles of the 3-6 forest block have higher depth
    if (x >= 4 && x <= 5 && y >= 4 && y <= 5) return 2;
    if (x >= 3 && x <= 6 && y >= 3 && y <= 6) return 1;
    return 0;
  }
}

describe('LocalMapGenerator', () => {
  let generator: LocalMapGenerator;

  beforeEach(() => {
    generator = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      42  // seed
    );
  });

  test('should generate a 43x43 grid', () => {
    const grid = generator.generateTile(4, 4);  // center of forest
    expect(grid.length).toBe(43);
    expect(grid[0].length).toBe(43);
  });

  test('should only contain valid characters', () => {
    const grid = generator.generateTile(4, 4);
    const validChars = new Set(['T', '.', '&', '"']);
    for (const row of grid) {
      for (const cell of row) {
        expect(validChars.has(cell)).toBe(true);
      }
    }
  });

  test('should have more trees in forest tiles than plains tiles', () => {
    const forestGrid = generator.generateTile(4, 4);  // forest center
    const plainsGrid = generator.generateTile(1, 1);  // plains

    const countTrees = (grid: string[][]) =>
      grid.flat().filter(c => c === 'T').length;

    expect(countTrees(forestGrid)).toBeGreaterThan(countTrees(plainsGrid));
  });

  test('should be deterministic with same seed', () => {
    const grid1 = generator.generateTile(4, 4);
    const generator2 = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      42
    );
    const grid2 = generator2.generateTile(4, 4);

    expect(grid1).toEqual(grid2);
  });

  test('should produce different results with different seeds', () => {
    const grid1 = generator.generateTile(4, 4);
    const generator2 = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      99
    );
    const grid2 = generator2.generateTile(4, 4);

    // Not identical (extremely unlikely with different seeds)
    const flat1 = grid1.flat().join('');
    const flat2 = grid2.flat().join('');
    expect(flat1).not.toEqual(flat2);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx jest src/core/local/__tests__/LocalMapGenerator.test.ts --no-cache`
Expected: FAIL — module not found.

**Step 4: Write the implementation**

File: `src/core/local/LocalMapGenerator.ts`

```typescript
import { createNoise2D } from 'simplex-noise';
import alea from 'simplex-noise/dist/esm/alea.js';
import { MapData } from '../data/MapData.js';
import { ForestData } from '../data/ForestData.js';
import { getDensityForDepth, type DensityEntry } from './ForestDensityConfig.js';

const TILE_SIZE = 43;
const BORDER = 4;
const WORK_SIZE = TILE_SIZE + BORDER * 2;  // 51

export class LocalMapGenerator {
  private noise2D: (x: number, y: number) => number;
  private noise2D_2: (x: number, y: number) => number;
  private noise2D_3: (x: number, y: number) => number;

  constructor(
    private mapData: MapData,
    private forestData: ForestData,
    private seed: number
  ) {
    const prng1 = alea(seed);
    const prng2 = alea(seed + 1);
    const prng3 = alea(seed + 2);
    this.noise2D = createNoise2D(prng1);
    this.noise2D_2 = createNoise2D(prng2);
    this.noise2D_3 = createNoise2D(prng3);
  }

  generateTile(wx: number, wy: number): string[][] {
    // Step 1 & 2: Noise sampling + initial placement on 51x51
    const work = this.generateInitialPlacement(wx, wy);

    // Step 3: Cellular automata (2 passes)
    this.applyCellularAutomata(work, 2);

    // Step 4: Trim to 43x43
    const result: string[][] = [];
    for (let ly = 0; ly < TILE_SIZE; ly++) {
      result.push(work[ly + BORDER].slice(BORDER, BORDER + TILE_SIZE));
    }
    return result;
  }

  private generateInitialPlacement(wx: number, wy: number): string[][] {
    // Build 3x3 density grid from world map
    const densityGrid = this.buildDensityGrid(wx, wy);

    const grid: string[][] = [];
    for (let wy_off = -BORDER; wy_off < TILE_SIZE + BORDER; wy_off++) {
      const row: string[] = [];
      for (let wx_off = -BORDER; wx_off < TILE_SIZE + BORDER; wx_off++) {
        const gx = wx * TILE_SIZE + wx_off;
        const gy = wy * TILE_SIZE + wy_off;

        // Multi-octave noise at global coordinates
        let n = 0;
        n += 1.0  * this.noise2D(gx / 20.0, gy / 20.0);
        n += 0.5  * this.noise2D_2(gx / 10.0, gy / 10.0);
        n += 0.25 * this.noise2D_3(gx / 5.0, gy / 5.0);
        // Normalize from [-1.75, 1.75] to [0, 1]
        n = (n / 1.75 + 1) / 2;

        // Interpolated density
        const density = this.interpolateDensity(densityGrid, wx_off, wy_off);

        // Threshold into terrain
        const cell = this.thresholdToTerrain(n, density);
        row.push(cell);
      }
      grid.push(row);
    }
    return grid;
  }

  private buildDensityGrid(wx: number, wy: number): DensityEntry[][] {
    const grid: DensityEntry[][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const row: DensityEntry[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        const depth = this.forestData.getDepth(wx + dx, wy + dy);
        row.push(getDensityForDepth(depth));
      }
      grid.push(row);
    }
    return grid;
  }

  private interpolateDensity(
    grid: DensityEntry[][],
    lx: number,
    ly: number
  ): DensityEntry {
    const u = lx / TILE_SIZE;
    const v = ly / TILE_SIZE;

    let ix: number, tx: number;
    if (u < 0.5) { ix = 0; tx = u + 0.5; }
    else         { ix = 1; tx = u - 0.5; }

    let iy: number, ty: number;
    if (v < 0.5) { iy = 0; ty = v + 0.5; }
    else         { iy = 1; ty = v - 0.5; }

    const d00 = grid[iy][ix];
    const d10 = grid[iy][ix + 1];
    const d01 = grid[iy + 1][ix];
    const d11 = grid[iy + 1][ix + 1];

    return {
      treeDensity: this.bilerp(d00.treeDensity, d10.treeDensity, d01.treeDensity, d11.treeDensity, tx, ty),
      brambleMargin: this.bilerp(d00.brambleMargin, d10.brambleMargin, d01.brambleMargin, d11.brambleMargin, tx, ty),
      herbMargin: this.bilerp(d00.herbMargin, d10.herbMargin, d01.herbMargin, d11.herbMargin, tx, ty),
    };
  }

  private bilerp(d00: number, d10: number, d01: number, d11: number, tx: number, ty: number): number {
    const top = d00 + (d10 - d00) * tx;
    const bot = d01 + (d11 - d01) * tx;
    return top + (bot - top) * ty;
  }

  private thresholdToTerrain(noise: number, density: DensityEntry): string {
    if (noise < density.treeDensity) return 'T';
    if (noise < density.treeDensity + density.brambleMargin) return '&';
    if (noise < density.treeDensity + density.brambleMargin + density.herbMargin) return '"';
    return '.';
  }

  private applyCellularAutomata(grid: string[][], passes: number): void {
    for (let pass = 0; pass < passes; pass++) {
      const snapshot = grid.map(row => [...row]);
      for (let y = 1; y < grid.length - 1; y++) {
        for (let x = 1; x < grid[0].length - 1; x++) {
          let treeCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (snapshot[y + dy][x + dx] === 'T') treeCount++;
            }
          }

          if (snapshot[y][x] === 'T') {
            if (treeCount < 2) grid[y][x] = '&';
          } else {
            if (treeCount >= 5) grid[y][x] = 'T';
          }
        }
      }
    }
  }
}
```

**Note on simplex-noise import:** The `simplex-noise` package exports `createNoise2D` and includes an `alea` PRNG. Check the actual package API at import time — if `alea` isn't at that path, use: `import { createNoise2D, alea } from 'simplex-noise';` or create a simple seeded PRNG. The key requirement is deterministic noise from a seed.

**Step 5: Run tests to verify they pass**

Run: `npx jest src/core/local/__tests__/LocalMapGenerator.test.ts --no-cache`
Expected: All 5 tests PASS.

**Step 6: Commit**

```bash
git add src/core/local/LocalMapGenerator.ts src/core/local/ForestDensityConfig.ts src/core/local/__tests__/LocalMapGenerator.test.ts
git commit -m "feat: add LocalMapGenerator with noise + CA forest generation"
```

---

### Task 5: ViewMode Component and Mode Switching

**Files:**
- Create: `src/core/components/ViewMode.ts`
- Create: `src/core/components/LocalPosition.ts`

**Step 1: Create ViewMode component**

File: `src/core/components/ViewMode.ts`

```typescript
import type { Component } from '../ecs/Component.js';

export class ViewMode implements Component {
  readonly type = 'ViewMode';
  constructor(public mode: 'world' | 'local' = 'world') {}
}
```

**Step 2: Create LocalPosition component**

File: `src/core/components/LocalPosition.ts`

```typescript
import type { Component } from '../ecs/Component.js';

export class LocalPosition implements Component {
  readonly type = 'LocalPosition';
  constructor(
    public wx: number = 0,
    public wy: number = 0,
    public lx: number = 21,
    public ly: number = 21
  ) {}
}
```

**Step 3: Commit**

```bash
git add src/core/components/ViewMode.ts src/core/components/LocalPosition.ts
git commit -m "feat: add ViewMode and LocalPosition components"
```

---

### Task 6: LocalMapCache

**Files:**
- Create: `src/core/local/LocalMapCache.ts`
- Create: `src/core/local/__tests__/LocalMapCache.test.ts`

**Step 1: Write the failing test**

File: `src/core/local/__tests__/LocalMapCache.test.ts`

```typescript
import { LocalMapCache } from '../LocalMapCache.js';

describe('LocalMapCache', () => {
  let cache: LocalMapCache;

  beforeEach(() => {
    cache = new LocalMapCache();
  });

  test('should return null for uncached tile', () => {
    expect(cache.get(5, 10)).toBeNull();
  });

  test('should store and retrieve a tile', () => {
    const grid = [['T', '.'], ['.', 'T']];
    cache.set(5, 10, grid);
    expect(cache.get(5, 10)).toEqual(grid);
  });

  test('should return has correctly', () => {
    expect(cache.has(5, 10)).toBe(false);
    cache.set(5, 10, [['T']]);
    expect(cache.has(5, 10)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/core/local/__tests__/LocalMapCache.test.ts --no-cache`
Expected: FAIL.

**Step 3: Write the implementation**

File: `src/core/local/LocalMapCache.ts`

```typescript
export class LocalMapCache {
  private cache = new Map<string, string[][]>();

  private key(wx: number, wy: number): string {
    return `${wx},${wy}`;
  }

  get(wx: number, wy: number): string[][] | null {
    return this.cache.get(this.key(wx, wy)) ?? null;
  }

  set(wx: number, wy: number, grid: string[][]): void {
    this.cache.set(this.key(wx, wy), grid);
  }

  has(wx: number, wy: number): boolean {
    return this.cache.has(this.key(wx, wy));
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/core/local/__tests__/LocalMapCache.test.ts --no-cache`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/core/local/LocalMapCache.ts src/core/local/__tests__/LocalMapCache.test.ts
git commit -m "feat: add LocalMapCache for generated tile storage"
```

---

### Task 7: LocalViewportSystem

**Files:**
- Create: `src/core/systems/LocalViewportSystem.ts`

**Step 1: Write the system**

This system maintains a 51x51 viewport centered on the player's local position, pulling tile data from the LocalMapCache. It reads from the 3x3 neighborhood of generated tiles.

File: `src/core/systems/LocalViewportSystem.ts`

```typescript
import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { LocalPosition } from '../components/LocalPosition.js';
import { LocalMapCache } from '../local/LocalMapCache.js';

const TILE_SIZE = 43;
const VIEWPORT_SIZE = 51;

export class LocalViewportSystem extends System {
  private viewport: string[][] = [];

  constructor(private cache: LocalMapCache) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length === 0) return;

    const lp = players[0].getComponent<LocalPosition>('LocalPosition');
    if (!lp) return;

    const halfView = Math.floor(VIEWPORT_SIZE / 2);
    this.viewport = [];

    for (let vy = 0; vy < VIEWPORT_SIZE; vy++) {
      const row: string[] = [];
      for (let vx = 0; vx < VIEWPORT_SIZE; vx++) {
        // Global local coords relative to player
        let glx = lp.wx * TILE_SIZE + lp.lx - halfView + vx;
        let gly = lp.wy * TILE_SIZE + lp.ly - halfView + vy;

        // Convert to world tile + local offset
        let twx = Math.floor(glx / TILE_SIZE);
        let tlx = glx - twx * TILE_SIZE;
        let twy = Math.floor(gly / TILE_SIZE);
        let tly = gly - twy * TILE_SIZE;

        const grid = this.cache.get(twx, twy);
        if (grid && tly >= 0 && tly < TILE_SIZE && tlx >= 0 && tlx < TILE_SIZE) {
          row.push(grid[tly][tlx]);
        } else {
          row.push(' ');
        }
      }
      this.viewport.push(row);
    }
  }

  getViewport(): string[][] {
    return this.viewport;
  }

  getViewportSize(): { width: number; height: number } {
    return { width: VIEWPORT_SIZE, height: VIEWPORT_SIZE };
  }
}
```

**Step 2: Commit**

```bash
git add src/core/systems/LocalViewportSystem.ts
git commit -m "feat: add LocalViewportSystem for 51x51 local view"
```

---

### Task 8: LocalMovementSystem

**Files:**
- Create: `src/core/systems/LocalMovementSystem.ts`

**Step 1: Write the system**

Handles movement in local view. Trees (`T`) and rocks (`#`) block. Water (`=`) blocks. Brambles (`&`) are passable (slowing is a future feature). Handles tile-edge transitions.

File: `src/core/systems/LocalMovementSystem.ts`

```typescript
import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { LocalPosition } from '../components/LocalPosition.js';
import { InputSystem } from './InputSystem.js';
import { LocalMapCache } from '../local/LocalMapCache.js';
import { LocalMapGenerator } from '../local/LocalMapGenerator.js';

const TILE_SIZE = 43;

export class LocalMovementSystem extends System {
  constructor(
    private inputSystem: InputSystem,
    private cache: LocalMapCache,
    private generator: LocalMapGenerator
  ) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const direction = this.inputSystem.consumeDirection();
    if (!direction) return;

    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length === 0) return;

    const lp = players[0].getComponent<LocalPosition>('LocalPosition');
    if (!lp) return;

    let dx = 0, dy = 0;
    if (direction.includes('left'))  dx = -1;
    if (direction.includes('right')) dx = 1;
    if (direction.includes('up'))    dy = -1;
    if (direction.includes('down'))  dy = 1;

    let newLx = lp.lx + dx;
    let newLy = lp.ly + dy;
    let newWx = lp.wx;
    let newWy = lp.wy;

    // Handle tile boundary crossing
    if (newLx < 0) { newWx--; newLx += TILE_SIZE; }
    if (newLx >= TILE_SIZE) { newWx++; newLx -= TILE_SIZE; }
    if (newLy < 0) { newWy--; newLy += TILE_SIZE; }
    if (newLy >= TILE_SIZE) { newWy++; newLy -= TILE_SIZE; }

    // Ensure destination tile is generated
    this.ensureGenerated(newWx, newWy);

    // Check collision
    const grid = this.cache.get(newWx, newWy);
    if (!grid) return;

    const destTile = grid[newLy][newLx];
    if (destTile === 'T' || destTile === '#' || destTile === '=') return;

    lp.lx = newLx;
    lp.ly = newLy;
    lp.wx = newWx;
    lp.wy = newWy;

    // Generate surrounding tiles when entering a new world tile
    if (newWx !== lp.wx || newWy !== lp.wy) {
      this.ensureNeighborsGenerated(newWx, newWy);
    }
  }

  ensureGenerated(wx: number, wy: number): void {
    if (!this.cache.has(wx, wy)) {
      this.cache.set(wx, wy, this.generator.generateTile(wx, wy));
    }
  }

  ensureNeighborsGenerated(wx: number, wy: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.ensureGenerated(wx + dx, wy + dy);
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/core/systems/LocalMovementSystem.ts
git commit -m "feat: add LocalMovementSystem with collision and tile-edge transitions"
```

---

### Task 9: LocalRenderSystem

**Files:**
- Create: `src/core/systems/LocalRenderSystem.ts`

**Step 1: Write the system**

Creates StyledTile[][] from the local viewport, applying terrain colors for local tile characters.

File: `src/core/systems/LocalRenderSystem.ts`

```typescript
import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { LocalPosition } from '../components/LocalPosition.js';
import { Renderable } from '../components/Renderable.js';
import { LocalViewportSystem } from './LocalViewportSystem.js';
import type { StyledTile } from '../../shared/StyledTile.js';
import type { TerrainStyle } from './TerrainColors.js';

const LOCAL_TERRAIN_STYLES: Record<string, TerrainStyle> = {
  'T': { color: 'green' },
  '.': { color: 'gray' },
  '&': { color: 'green', dim: true },
  '"': { color: 'yellow' },
  '#': { color: 'gray', bold: true },
  '=': { color: 'blueBright' },
  '~': { color: 'yellow' },
  '%': { color: 'green', dim: true },
  '^': { color: 'red' },
  ' ': {},
};

function getLocalTerrainStyle(char: string): TerrainStyle {
  return LOCAL_TERRAIN_STYLES[char] || { color: 'white' };
}

export class LocalRenderSystem extends System {
  private styledMap: StyledTile[][] = [];

  constructor(private localViewportSystem: LocalViewportSystem) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const viewport = this.localViewportSystem.getViewport();
    const viewSize = this.localViewportSystem.getViewportSize();

    this.styledMap = viewport.map(row =>
      row.map(char => ({
        char,
        style: getLocalTerrainStyle(char),
      }))
    );

    // Overlay player entity
    const halfView = Math.floor(viewSize.width / 2);
    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length > 0) {
      const renderable = players[0].getComponent<Renderable>('Renderable');
      if (renderable) {
        this.styledMap[halfView][halfView] = {
          char: renderable.char,
          style: {
            color: renderable.color,
            backgroundColor: renderable.backgroundColor,
            bold: renderable.bold,
            dim: renderable.dim,
          },
        };
      }
    }
  }

  getStyledMap(): StyledTile[][] {
    return this.styledMap;
  }
}
```

**Step 2: Commit**

```bash
git add src/core/systems/LocalRenderSystem.ts
git commit -m "feat: add LocalRenderSystem for local view styling"
```

---

### Task 10: Integrate Mode Switching into WebGame

**Files:**
- Modify: `src/web/WebGame.tsx`

This is the integration task — wire everything together with the `M` key to toggle between world and local views.

**Step 1: Add imports and state**

At the top of `WebGame.tsx`, add imports for the new modules:

```typescript
import { ForestData } from '../core/data/ForestData.js';
import { LocalMapGenerator } from '../core/local/LocalMapGenerator.js';
import { LocalMapCache } from '../core/local/LocalMapCache.js';
import { LocalViewportSystem } from '../core/systems/LocalViewportSystem.js';
import { LocalMovementSystem } from '../core/systems/LocalMovementSystem.js';
import { LocalRenderSystem } from '../core/systems/LocalRenderSystem.js';
import { ViewMode } from '../core/components/ViewMode.js';
import { LocalPosition } from '../core/components/LocalPosition.js';
```

Add new state variables alongside existing ones:

```typescript
const [forestData] = useState(() => new ForestData(dataLoader));
const [localMapCache] = useState(() => new LocalMapCache());
const [viewMode, setViewMode] = useState<'world' | 'local'>('world');
```

**Step 2: Load forest data in loadData**

In the `loadData` async function, after loading other data:

```typescript
await forestData.loadFromFile('middle_earth_forests.bin');
```

**Step 3: Create local systems after data is loaded**

After loading, create the local systems (they depend on loaded data):

```typescript
const localGenerator = new LocalMapGenerator(mapData, forestData, 42);
const localViewportSys = new LocalViewportSystem(localMapCache);
const localMovementSys = new LocalMovementSystem(inputSystem, localMapCache, localGenerator);
const localRenderSys = new LocalRenderSystem(localViewportSys);
```

Store these in refs or state so the keyboard handler and game loop can access them.

**Step 4: Add `M` key handler**

In the keyboard handler, add a case for `M`/`m`:

```typescript
case 'm':
case 'M': {
  // Toggle view mode
  const player = world.getEntitiesWithComponent('Player')[0];
  if (!player) break;

  const currentMode = player.getComponent<ViewMode>('ViewMode');
  if (!currentMode || currentMode.mode === 'world') {
    // Switch to local view
    const pos = player.getComponent<Position>('Position')!;

    // Add local components if not present
    if (!player.hasComponent('ViewMode')) {
      player.addComponent(new ViewMode('local'));
    } else {
      currentMode!.mode = 'local';
    }

    if (!player.hasComponent('LocalPosition')) {
      player.addComponent(new LocalPosition(pos.x, pos.y, 21, 21));
    } else {
      const lp = player.getComponent<LocalPosition>('LocalPosition')!;
      lp.wx = pos.x;
      lp.wy = pos.y;
      lp.lx = 21;
      lp.ly = 21;
    }

    // Generate the 3x3 neighborhood
    localMovementSys.ensureNeighborsGenerated(pos.x, pos.y);

    setViewMode('local');
  } else {
    // Switch back to world view
    currentMode.mode = 'world';

    // Update world position from local position
    const lp = player.getComponent<LocalPosition>('LocalPosition');
    if (lp) {
      const pos = player.getComponent<Position>('Position')!;
      pos.x = lp.wx;
      pos.y = lp.wy;
    }

    setViewMode('world');
  }
  break;
}
```

**Step 5: Conditionally run systems in game loop**

In the game loop, choose which systems to update based on view mode:

```typescript
const gameLoop = (currentTime: number) => {
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  if (viewMode === 'world') {
    world.update(deltaTime);
    setMapDisplay(renderSystem.getStyledMap());
    setRegionInfo(regionDisplaySystem.getPlayerRegionInfo(world));
  } else {
    // Local mode: run local systems manually
    inputSystem.update(world, deltaTime);
    localMovementSys.update(world, deltaTime);
    localViewportSys.update(world, deltaTime);
    localRenderSys.update(world, deltaTime);
    setMapDisplay(localRenderSys.getStyledMap());
    setRegionInfo(null);
  }

  animationFrameRef.current = requestAnimationFrame(gameLoop);
};
```

**Step 6: Update the HUD to show view mode**

In the JSX, update the instruction text:

```typescript
<div>
  {viewMode === 'world'
    ? 'Numpad/hjklyubn/Arrows to move | M = Enter local view | @ = You'
    : 'Numpad/hjklyubn/Arrows to move | M = World map | @ = You'}
</div>
```

**Step 7: Test manually**

Start the dev server: `npm start`
Expected behavior:
1. Game loads at Hobbiton on the world map (existing behavior)
2. Press `M` — viewport switches to 51x51 local view with generated forest/plains terrain
3. Walk around with arrow keys / vim keys — `T` blocks movement
4. Press `M` again — back to world map at the same world tile position
5. Navigate to a forest edge on the world map, press `M` — see tree density increase with forest depth

**Step 8: Commit**

```bash
git add src/web/WebGame.tsx
git commit -m "feat: integrate local view with M key toggle and forest generation"
```

---

### Task 11: Terrain Color Tuning

**Files:**
- Modify: `src/core/systems/LocalRenderSystem.ts` (if colors need adjustment)

**Step 1: Visual testing and tuning**

Run: `npm start`

Navigate to several locations and press `M`:
1. The Old Forest near Hobbiton — should have trees with depth gradient
2. Open plains (The Shire) — should have sparse/no trees
3. Edge of a forest — should see natural transition

Look for:
- Are `T` trees green and clearly visible?
- Are `&` brambles distinguishable from trees?
- Are `"` herbs visible but subtle?
- Is `.` ground a clear neutral color?
- Does the density feel right at each depth level?

Adjust `LOCAL_TERRAIN_STYLES` and `FOREST_DENSITY_CURVE` values based on feedback.

**Step 2: Commit any adjustments**

```bash
git add -A
git commit -m "fix: tune terrain colors and density curve for forest generation"
```

---

## Summary of Files Created/Modified

**New files:**
- `scripts/forest_depth_preprocessing.py`
- `src/core/data/ForestData.ts`
- `src/core/data/__tests__/ForestData.test.ts`
- `src/core/local/LocalMapGenerator.ts`
- `src/core/local/ForestDensityConfig.ts`
- `src/core/local/__tests__/LocalMapGenerator.test.ts`
- `src/core/local/LocalMapCache.ts`
- `src/core/local/__tests__/LocalMapCache.test.ts`
- `src/core/components/ViewMode.ts`
- `src/core/components/LocalPosition.ts`
- `src/core/systems/LocalViewportSystem.ts`
- `src/core/systems/LocalMovementSystem.ts`
- `src/core/systems/LocalRenderSystem.ts`

**Modified files:**
- `package.json` (preprocess script, simplex-noise dep)
- `src/web/WebGame.tsx` (mode switching integration)

**Generated files:**
- `maps/middle_earth_forests.bin`
