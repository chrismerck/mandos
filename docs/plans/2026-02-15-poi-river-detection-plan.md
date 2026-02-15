# POI & River Name Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect POIs (`!Name` → nearest `o` tile) and rivers/roads (`@Name` → flood-filled connected tiles) from the ASCII map, and display the name in brackets when the player walks on that tile.

**Architecture:** Python preprocessing module scans the raw map for `!` and `@` labels, associates them with terrain tiles via BFS/flood-fill, and outputs a per-tile binary grid (`POI1` format). TypeScript loads this binary at startup and shows `[Name]` in the status bar when the player is on a named tile, replacing the region display.

**Tech Stack:** Python 3 (numpy, collections, struct), TypeScript, React, Jest

---

### Task 1: Python POI/River Preprocessing Module — Label Scanning

**Files:**
- Create: `scripts/poi_river_preprocessing.py`

**Step 1: Write the label scanner**

Create `scripts/poi_river_preprocessing.py` with functions to scan the map grid for `!Name` and `@Name` labels. This is the foundation — just label extraction, no BFS yet.

```python
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
```

**Step 2: Manually verify label scanning**

Run a quick test from the command line:

```bash
cd /Users/cmerck/src/chrismerck/mandos2
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from poi_river_preprocessing import _scan_labels
# Load map
with open('maps/middle_earth.worldmap') as f:
    lines = [ln.rstrip('\n') for ln in f]
W = max(len(ln) for ln in lines)
grid = [list(ln.ljust(W)) for ln in lines]
# Scan
pois = _scan_labels(grid, '!')
rivers = _scan_labels(grid, '@')
print(f'Found {len(pois)} POI labels:')
for p in pois[:10]:
    print(f'  {p[\"name\"]} at ({p[\"row\"]}, {p[\"col\"]})')
print(f'Found {len(rivers)} river/road labels:')
for r in rivers[:10]:
    print(f'  {r[\"name\"]} at ({r[\"row\"]}, {r[\"col\"]})')
"
```

Expected: Lists of `!`-prefixed POI names (Hobbiton, Rivendell, etc.) and `@`-prefixed river/road names (R_Anduin, East_Road, etc.) with their coordinates.

**Step 3: Commit**

```bash
git add scripts/poi_river_preprocessing.py
git commit -m "feat: add POI/river label scanning module"
```

---

### Task 2: POI Association — BFS from `!` to Nearest `o`

**Files:**
- Modify: `scripts/poi_river_preprocessing.py`

**Step 1: Add BFS function to find nearest `o` from each `!`**

Append to `poi_river_preprocessing.py`:

```python
def _find_nearest_town(grid: List[List[str]], row: int, col: int) -> Tuple[int, int] | None:
    """BFS (8-connected) from (row, col) to find nearest 'o' tile."""
    H = len(grid)
    W = len(grid[0]) if grid else 0
    seen = {(row, col)}
    q = collections.deque([(row, col)])
    while q:
        r, c = q.popleft()
        for dr, dc in DIRS8:
            nr, nc = r + dr, c + dc
            if 0 <= nr < H and 0 <= nc < W and (nr, nc) not in seen:
                seen.add((nr, nc))
                if grid[nr][nc] == 'o':
                    return (nr, nc)
                q.append((nr, nc))
    return None
```

**Step 2: Verify with the real map**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from poi_river_preprocessing import _scan_labels, _find_nearest_town
with open('maps/middle_earth.worldmap') as f:
    lines = [ln.rstrip('\n') for ln in f]
W = max(len(ln) for ln in lines)
grid = [list(ln.ljust(W)) for ln in lines]
pois = _scan_labels(grid, '!')
for p in pois[:10]:
    town = _find_nearest_town(grid, p['row'], p['col'])
    print(f'{p[\"name\"]}: label at ({p[\"row\"]},{p[\"col\"]}) -> town at {town}')
"
```

Expected: Each POI label maps to a nearby `o` tile coordinate. Some POIs (like ruins) may not have an `o` — that's OK, they'll be `None`.

**Step 3: Commit**

```bash
git add scripts/poi_river_preprocessing.py
git commit -m "feat: add BFS to associate POI labels with nearest town marker"
```

---

### Task 3: River/Road Detection — Simultaneous BFS + Flood-Fill

**Files:**
- Modify: `scripts/poi_river_preprocessing.py`

**Step 1: Add simultaneous BFS to determine river vs road type**

Append to `poi_river_preprocessing.py`:

```python
def _classify_at_labels(grid: List[List[str]], labels: List[Dict[str, Any]]) -> None:
    """
    Simultaneous BFS from all @ label positions.
    The first river (|, -, +) or road (.) tile each label reaches
    determines whether it's a 'river' or 'road'.
    Mutates each label dict to add 'type' and 'seed' keys.
    """
    H = len(grid)
    W = len(grid[0]) if grid else 0
    # Each label gets an index
    label_map = {}  # (r,c) -> label_index for BFS ownership
    q = collections.deque()
    seen = set()

    for i, lbl in enumerate(labels):
        r, c = lbl['row'], lbl['col']
        # Seed from the @ character position
        seen.add((r, c))
        label_map[(r, c)] = i
        q.append((r, c, i))

    while q:
        r, c, idx = q.popleft()
        lbl = labels[idx]
        if 'type' in lbl:
            continue  # Already classified

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

    # Labels that couldn't find any river or road
    for lbl in labels:
        if 'type' not in lbl:
            lbl['type'] = None
            lbl['seed'] = None
```

**Step 2: Add flood-fill for rivers and roads**

```python
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
```

**Step 3: Verify river classification and flood-fill**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from poi_river_preprocessing import _scan_labels, _classify_at_labels
with open('maps/middle_earth.worldmap') as f:
    lines = [ln.rstrip('\n') for ln in f]
W = max(len(ln) for ln in lines)
grid = [list(ln.ljust(W)) for ln in lines]
labels = _scan_labels(grid, '@')
_classify_at_labels(grid, labels)
for lbl in labels:
    print(f'{lbl[\"name\"]}: type={lbl.get(\"type\")} seed={lbl.get(\"seed\")}')
"
```

Expected: Each `@`-label classified as `river` or `road` based on nearest terrain. e.g., `R_Anduin: type=river`, `East_Road: type=road`.

**Step 4: Commit**

```bash
git add scripts/poi_river_preprocessing.py
git commit -m "feat: add river/road classification and flood-fill"
```

---

### Task 4: Main Driver + Binary Output

**Files:**
- Modify: `scripts/poi_river_preprocessing.py`
- Modify: `scripts/map_preprocessing.py:7` (add import)
- Modify: `scripts/map_preprocessing.py:125-129` (call new module)
- Modify: `scripts/map_preprocessing.py:216-224` (print stats)

**Step 1: Add main driver function and binary writer**

Append to `poi_river_preprocessing.py`:

```python
def build_poi_river_grid(grid: List[List[str]], H: int, W: int) -> Tuple[np.ndarray, List[str]]:
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

    # 1) POI labels: !Name -> nearest 'o' tile
    poi_labels = _scan_labels(grid, '!')
    for lbl in poi_labels:
        town = _find_nearest_town(grid, lbl['row'], lbl['col'])
        if town is not None:
            tr, tc = town
            if poi_grid[tr, tc] == 255:
                poi_grid[tr, tc] = next_id
                names.append(lbl['name'])
                next_id += 1

    # 2) River/road labels: @Name -> flood-fill connected tiles
    at_labels = _scan_labels(grid, '@')
    _classify_at_labels(grid, at_labels)
    river_names, next_id = _flood_fill_from_seeds(grid, at_labels, poi_grid, next_id)
    names.extend(river_names)

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
```

**Step 2: Integrate into map_preprocessing.py**

In `scripts/map_preprocessing.py`:

Add import at line 7 (after the geo_features import):
```python
from poi_river_preprocessing import build_poi_river_grid, write_poi_binary
```

After line 129 (after `grid = clean_grid`), add the POI/river processing call:
```python
    # 4b) POI and river/road detection
    poi_grid, poi_names = build_poi_river_grid(original_grid, H, W)
```

Modify the CLI wrapper to accept a 4th argument for the POI binary output path, and call `write_poi_binary` alongside the existing outputs.

Update `process_map` signature to accept `output_poi_river_path`:
```python
def process_map(map_path, output_grid_path, output_poi_path, output_poi_river_path):
```

Add after the existing POI CSV write (after line 214):
```python
    # 12) Write POI/river binary
    write_poi_binary(output_poi_river_path, poi_grid, poi_names, W, H)
```

Update CLI wrapper:
```python
if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python map_preprocessing.py <input_map> <output_grid> <output_poi> <output_poi_river>")
        sys.exit(1)
    process_map(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
```

Update print stats to include POI/river counts.

**Step 3: Update package.json preprocess-map script**

In `package.json`, update the `preprocess-map` script to pass the 4th argument:

```json
"preprocess-map": "python3 scripts/map_preprocessing.py maps/middle_earth.worldmap maps/middle_earth_regions.bin maps/middle_earth_pois.csv maps/middle_earth_poi_rivers.bin",
```

**Step 4: Run preprocessing and verify**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
npm run preprocess-map
```

Expected: Prints stats including POI and river/road counts. Creates `maps/middle_earth_poi_rivers.bin`.

```bash
ls -la maps/middle_earth_poi_rivers.bin
```

Expected: Binary file exists, reasonable size (~100-300KB).

**Step 5: Copy binary to public directory**

The preprocess output goes to `maps/` but the web app serves from `public/maps/`. Either update the preprocess to output directly to `public/maps/`, or copy:

```bash
cp maps/middle_earth_poi_rivers.bin public/maps/
```

Check if the existing preprocess outputs go directly to `public/maps/` or `maps/`. If they go to `maps/` and are separately copied/symlinked, follow the same pattern. Looking at the existing setup, `public/maps/` already has the binary files, so the preprocess script should output there. Update the npm script path accordingly.

**Step 6: Commit**

```bash
git add scripts/poi_river_preprocessing.py scripts/map_preprocessing.py package.json maps/middle_earth_poi_rivers.bin public/maps/middle_earth_poi_rivers.bin
git commit -m "feat: generate POI/river binary data from map preprocessing"
```

---

### Task 5: TypeScript Data Loader — PoiRiverData

**Files:**
- Create: `src/core/data/PoiRiverData.ts`

**Step 1: Write the PoiRiverData class**

```typescript
import type { DataLoader } from '../../shared/DataLoader.js';

export class PoiRiverData {
  private width: number = 0;
  private height: number = 0;
  private poiGrid: Uint8Array | null = null;
  private poiNames: string[] = [];

  constructor(private loader: DataLoader) {}

  async loadFromFile(filename: string): Promise<void> {
    const buffer = await this.loader.loadBinaryFile(filename);
    this.parseBinary(new Uint8Array(buffer));
  }

  private parseBinary(buffer: Uint8Array): void {
    let offset = 0;

    const magic = String.fromCharCode(...buffer.slice(0, 4));
    if (magic !== 'POI1') {
      throw new Error(`Invalid POI file format. Expected 'POI1', got '${magic}'`);
    }
    offset += 4;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true);
    offset += 2;
    this.width = view.getUint16(offset, true);
    offset += 2;
    this.height = view.getUint16(offset, true);
    offset += 2;

    if (version !== 1) {
      throw new Error(`Unsupported POI version: ${version}`);
    }

    const gridSize = this.width * this.height;
    this.poiGrid = buffer.slice(offset, offset + gridSize);
    offset += gridSize;

    const numNames = buffer[offset];
    offset += 1;
    this.poiNames = [];
    for (let i = 0; i < numNames; i++) {
      const nameLen = buffer[offset];
      offset += 1;
      const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
      offset += nameLen;
      this.poiNames.push(name);
    }
  }

  getPoiName(x: number, y: number): string | null {
    if (!this.poiGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const id = this.poiGrid[y * this.width + x];
    if (id === 255) {
      return null;
    }
    return this.poiNames[id] || null;
  }

  static formatName(raw: string): string {
    let name = raw.replace(/_/g, ' ');
    if (name.startsWith('R ')) {
      name = 'R. ' + name.slice(2);
    }
    return name;
  }
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
npx tsc --noEmit src/core/data/PoiRiverData.ts
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/core/data/PoiRiverData.ts
git commit -m "feat: add TypeScript POI/river binary data loader"
```

---

### Task 6: Integrate into ECS — RegionInfo + RegionDisplaySystem + WebGame

**Files:**
- Modify: `src/core/components/RegionInfo.ts:6-9` (add poiName field)
- Modify: `src/core/systems/RegionDisplaySystem.ts` (query PoiRiverData, set poiName)
- Modify: `src/web/WebGame.tsx:8,27,33,35,132,160,174,186,237-241` (load data, display brackets)

**Step 1: Add poiName to RegionInfo**

In `src/core/components/RegionInfo.ts`, add `poiName` parameter:

```typescript
import { Component } from '../ecs/Component.js';

export class RegionInfo implements Component {
  type = 'RegionInfo';

  constructor(
    public realmName: string = '',
    public subRegionName: string = '',
    public poiName: string = ''
  ) {}
}
```

**Step 2: Update RegionDisplaySystem to use PoiRiverData**

Replace `src/core/systems/RegionDisplaySystem.ts`:

```typescript
import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { Position } from '../components/Position.js';
import { Player } from '../components/Player.js';
import { RegionInfo } from '../components/RegionInfo.js';
import { RegionData } from '../data/RegionData.js';
import { PoiRiverData } from '../data/PoiRiverData.js';

export class RegionDisplaySystem extends System {
  constructor(private regionData: RegionData, private poiRiverData?: PoiRiverData) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const players = world.getEntitiesWithComponent('Player');

    for (const entity of players) {
      const position = entity.getComponent('Position') as Position;
      const player = entity.getComponent('Player') as Player;

      if (position && player) {
        let regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
        if (!regionInfo) {
          regionInfo = new RegionInfo();
          entity.addComponent(regionInfo);
        }

        // Check for POI/river name first
        const rawPoiName = this.poiRiverData?.getPoiName(position.x, position.y) ?? null;
        const poiName = rawPoiName ? PoiRiverData.formatName(rawPoiName) : '';

        if (poiName) {
          regionInfo.realmName = '';
          regionInfo.subRegionName = '';
          regionInfo.poiName = poiName;
        } else {
          regionInfo.poiName = '';
          const region = this.regionData.getRegionInfo(position.x, position.y);

          if (region) {
            if (region.geoFeatureName) {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.geoFeatureName;
            } else {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.subRegionName;
            }
          } else {
            regionInfo.realmName = 'The Wilds';
            regionInfo.subRegionName = '';
          }
        }
      }
    }
  }

  getPlayerRegionInfo(world: World): { realm: string; subRegion: string; poiName: string } | null {
    const players = world.getEntitiesWithComponent('Player');

    for (const entity of players) {
      const regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
      if (regionInfo) {
        return {
          realm: regionInfo.realmName,
          subRegion: regionInfo.subRegionName,
          poiName: regionInfo.poiName
        };
      }
    }

    return null;
  }
}
```

**Step 3: Update WebGame.tsx**

Add import (after line 8):
```typescript
import { PoiRiverData } from '../core/data/PoiRiverData.js';
```

Add state (after line 28):
```typescript
const [poiRiverData] = useState(() => new PoiRiverData(dataLoader));
```

Update RegionDisplaySystem construction (line 33):
```typescript
const [regionDisplaySystem] = useState(() => new RegionDisplaySystem(regionData, poiRiverData));
```

Update regionInfo state type (line 35):
```typescript
const [regionInfo, setRegionInfo] = useState<{ realm: string; subRegion: string; poiName: string } | null>(null);
```

Add data loading (after line 133):
```typescript
await poiRiverData.loadFromFile('middle_earth_poi_rivers.bin');
```

Update dependency array on line 160 to include `poiRiverData`.

Update display (lines 237-241) to show brackets when poiName is set:

```tsx
{regionInfo && (
  <div style={{ color: '#00ffff', marginTop: '5px' }}>
    {regionInfo.poiName
      ? `[${regionInfo.poiName}]`
      : <>
          {regionInfo.realm}
          {regionInfo.subRegion && ` - ${regionInfo.subRegion}`}
        </>
    }
  </div>
)}
```

**Step 4: Verify it compiles**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
npx tsc --noEmit
```

Expected: No TypeScript errors.

**Step 5: Commit**

```bash
git add src/core/components/RegionInfo.ts src/core/systems/RegionDisplaySystem.ts src/web/WebGame.tsx src/core/data/PoiRiverData.ts
git commit -m "feat: display POI/river names in brackets on status bar"
```

---

### Task 7: Manual Testing

**Step 1: Run the preprocess pipeline**

```bash
cd /Users/cmerck/src/chrismerck/mandos2
npm run preprocess
```

Verify output includes POI/river stats.

**Step 2: Start the dev server**

```bash
npm start
```

**Step 3: Test in browser at localhost:3000**

Verify:
- Player starts at Hobbiton (145, 49). Walk to the nearby `o` tile — status bar should show `[Hobbiton]`
- Walk away from the town — status bar returns to `Eriador - The Shire`
- Find a river (walk to `|` or `-` tiles near a named river) — status bar should show `[R. Anduin]` or similar
- Walk on a road — status bar should show `[East Road]` or similar

**Step 4: Run existing tests to check for regressions**

```bash
npm test
```

Expected: All existing tests pass. The RegionDisplaySystem constructor now takes an optional second parameter, so existing tests (if any mock it) should still work since it's optional.

**Step 5: Commit any fixes if needed**

---

### Task 8: Label Cleanup in Grid

**Files:**
- Modify: `scripts/poi_river_preprocessing.py`

The `!Name` and `@Name` label text currently remains in the grid after preprocessing. The geo_features module already skips these labels (lines 51-57 and 77-83 of `geo_features_preprocessing.py`), so they don't interfere with geo feature detection. However, the label characters appear as terrain on the game map.

**Step 1: Add label cleanup to build_poi_river_grid**

After scanning labels, blank the label text from the grid (replace with space). This should happen on the `original_grid` that gets passed to other processing steps, OR the cleanup should happen in `map_preprocessing.py` after all modules have read what they need.

Since `geo_features_preprocessing.py` already handles skipping `!` and `@` labels, and the cleaned grid is used for terrain processing, the safest approach is to clean `!` and `@` labels from the `clean_grid` returned by geo features. Add cleanup in `map_preprocessing.py` after the geo feature step:

```python
    # 4c) Clean !Name and @Name labels from grid
    for r in range(H):
        c = 0
        while c < W:
            ch = grid[r][c]
            if ch in ('!', '@') and c + 1 < W and grid[r][c + 1].isalpha():
                grid[r][c] = ' '
                c += 1
                while c < W and (grid[r][c].isalnum() or grid[r][c] in ('_', "'")):
                    grid[r][c] = ' '
                    c += 1
                continue
            c += 1
```

**Step 2: Re-run preprocess and verify labels are cleaned**

```bash
npm run preprocess
```

**Step 3: Start dev server and verify the label text no longer appears on the map**

```bash
npm start
```

Check that `!Hobbiton`, `!Rivendell`, `@R_Anduin`, etc. text is no longer rendered on the game map.

**Step 4: Commit**

```bash
git add scripts/map_preprocessing.py
git commit -m "fix: clean POI and river label text from rendered map"
```
