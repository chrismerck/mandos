# Local Map Generation Design

## Overview

Each world map tile expands into a 43x43 grid of local tiles. The player explores the world at local scale through a 51x51 viewport (4 tiles of overlap into neighboring world tiles on each side). Terrain is generated procedurally using layered simplex noise modulated by world map context.

## Data Model

### Coordinate System

- **World coordinates**: `(wx, wy)` — position on the ASCII world map.
- **Local coordinates**: `(lx, ly)` — position within a world tile's 43x43 grid, range [0, 42].
- **Global local coordinates**: `(wx * 43 + lx, wy * 43 + ly)` — used as noise input for seamless generation.

### Tile Lifecycle

1. Player enters viewport range of a world tile.
2. System checks if that tile's local map is already generated.
3. If not, generate it from world map context + global noise.
4. Cache in memory; persist to IndexedDB for revisits.
5. Evict distant tiles from memory under pressure (reload from IndexedDB or regenerate).

### Generation Scope

When the player occupies world tile `(wx, wy)`, ensure all 9 tiles in the 3x3 grid are generated (current + 8 neighbors, including diagonals — the square viewport can see into corners).

## Local Tile Character Set

| Char | Meaning        | Movement              |
|------|----------------|-----------------------|
| `T`  | Tree           | Blocks                |
| `.`  | Ground / path  | Walkable (brown on roads) |
| `=`  | Water          | Blocks                |
| `#`  | Rock / cliff   | Blocks                |
| `^`  | Pit            | Hazard (fall / jump)  |
| `~`  | Hills          | Slows                 |
| `%`  | Marsh / bog    | Slows                 |
| `"`  | Herbs / low vegetation | Walkable        |
| `&`  | Brambles       | Slows                 |

## Generation Algorithm

### Core Principle: No Boundary Conditions Needed

The algorithm uses two continuous functions that are inherently seamless across tile boundaries:

1. **Simplex noise** sampled at global coordinates — adjacent tiles sample neighboring points of the same continuous function.
2. **Density modulation** via bilinear interpolation of world-map-derived density values between tile centers — smooth transitions by construction.

### Step 1: Gather World Map Context

For world tile `(wx, wy)`, read the 3x3 neighborhood of world map characters and depth values. Compute a density value for each of the 9 tiles based on terrain type and depth.

### Step 2: Generate Density Field

For each local cell `(lx, ly)`:

```
gx = wx * 43 + lx
gy = wy * 43 + ly

// Multi-octave simplex noise at global coordinates
n  = 1.0  * simplex(gx/20.0, gy/20.0, SEED)
n += 0.5  * simplex(gx/10.0, gy/10.0, SEED+1)
n += 0.25 * simplex(gx/5.0,  gy/5.0,  SEED+2)
n = normalize(n)  // map to [0, 1]

// Bilinearly interpolated density threshold
density = interpolateDensity(densityGrid3x3, lx, ly)

if n < density:
    place terrain feature (e.g., 'T' for forest)
else:
    place ground (e.g., '.')
```

### Step 3: Density Interpolation

Tile centers sit at `(0.5, 0.5)` in normalized tile space. The interpolation blends between the 4 nearest tile centers:

```
function interpolateDensity(densityGrid, lx, ly):
    u = lx / 43.0
    v = ly / 43.0

    if u < 0.5: ix = 0, tx = u + 0.5
    else:       ix = 1, tx = u - 0.5

    if v < 0.5: iy = 0, ty = v + 0.5
    else:       iy = 1, ty = v - 0.5

    return bilerp(
        densityGrid[iy][ix],   densityGrid[iy][ix+1],
        densityGrid[iy+1][ix], densityGrid[iy+1][ix+1],
        tx, ty
    )
```

### Step 4: Overlay Features

After base terrain, overlay streams, roads, and trails (see below).

## Terrain Generation by World Map Type

### Forest (`&`)

Tree density scales with forest depth:

| Forest depth | Base density | Feel                      |
|--------------|-------------|---------------------------|
| 1            | 0.10        | Scattered outcrops        |
| 2            | 0.25        | Light woodland            |
| 3            | 0.40        | Moderate forest, winding paths |
| 4            | 0.55        | Dense forest, maze-like   |
| 5+           | 0.70-0.90   | Near-impenetrable, may be fully blocked |

Deep forest can be truly impassable — no guaranteed path through.

### Plains (` `)

Tree density follows an exponential decay based on distance to nearest forest world tile:

```
treeDensity = 0.05 * exp(-distanceToForest / 10.0)
// At forest border:    ~5%
// 10 tiles away:       ~1.8%
// 20 tiles away:       ~0.7%
// 30 tiles away:       ~0.25%
```

Brambles (`&`) at moderate density, especially near forests. Herbs (`"`) scattered.

### Hills (`~`)

`~` hill tiles as ground surface. Tree density follows same forest-proximity rule as plains. Occasional `#` boulders at low density.

### Mountains (`^`)

`#` rock at high density based on mountain depth. `^` pits scattered in clearings. `.` walkable paths on ridges and cliff-tops. Trees present where mountain abuts forest (significant blending). Rocks scatter ~1 world tile into adjacent forest.

**Future work**: Cliffs perpendicular to the fall line, derived from smoothed mountain depth gradient.

### Ocean (`=`)

All `=`. No generation needed.

### Marsh (`%`)

Mix of `%` bog, `=` open water pools, `"` herbs, scattered `T` trees. Water and bog placement from noise.

### Cross-terrain Blending

The bilinear density interpolation naturally handles all transitions. Multiple density fields (tree density, rock density, etc.) can coexist — each terrain feature has its own noise layer and density curve.

## River & Stream Generation

### Width Model

River width varies by distance from source. Precomputed during map preprocessing — each river tile stores its distance from source and the river's total length.

```
function riverWidth(distFromSource, totalRiverLength):
    fraction = distFromSource / totalRiverLength
    minWidth = 1
    maxWidth = scaleByRiverLength(totalRiverLength)
    return minWidth + (maxWidth - minWidth) * fraction
```

Large rivers (Anduin) reach ~40 local tiles wide near their mouth. Small streams are 1-2 tiles wide. Narrow streams meander freely; wide rivers are more constrained — natural behavior.

### Entry/Exit Points

Crossing points at tile boundaries are determined by a shared hash of both tile coordinates:

```
// Vertical edge between (wx,wy) and (wx+1,wy):
crossingY = hash(min(wx,wx+1), max(wx,wx+1), wy, RIVER_SEED) % 33 + 5

// Horizontal edge between (wx,wy) and (wx,wy+1):
crossingX = hash(wx, min(wy,wy+1), max(wy,wy+1), RIVER_SEED) % 33 + 5
```

Both neighbors compute identical crossing points. Offset by 5 and mod 33 keeps crossings away from corners.

### Path Through Tile

Connect entry/exit points with midpoint displacement:

1. Straight line from entry to exit.
2. Displace midpoint perpendicular to flow using noise.
3. Recurse 2-3 times for natural curves.
4. Rasterize to local tile coordinates at the computed width.

River direction: `-` world tile = east-west flow, `|` = north-south. Where they meet, the stream curves naturally via midpoint displacement.

All water rendered as `=`. Riverbank: 1-tile cleared margin on each side (trees replaced with `.`).

## Road Generation

### Terrain-Aware Pathfinding

Roads are generated after base terrain, using A* pathfinding that considers the full road width.

1. Determine entry/exit points from world map (shared hash, same as rivers).
2. Pathfind a 5-wide corridor from entry to exit.
3. A* state is `(centerX, centerY, direction, currentWidth)`.
4. Cost function evaluates all tiles in the cross-section plus a narrowing penalty:

```
function roadCost(center, direction, width, terrain):
    cost = sum of tileCost for all tiles in cross-section
    cost += narrowingPenalty(previousWidth, width)
    return cost

tileCost:
    '.' ground:    1
    '"' herbs:     1
    '&' brambles:  3
    'T' trees:     10
    '~' hills:     5
    '#' rock:      50
    '=' water:     100
```

5. Road naturally routes around obstacles at full 5-tile width.
6. Narrows to 1-2 tile trail only when forced through forest — narrowing penalty makes this a last resort.
7. Widens back to 5 on exiting forest.
8. Clear terrain along the road corridor (replace trees/brambles with `.`).

### Width by Context

| Context     | Width   |
|-------------|---------|
| Open ground | 5 tiles |
| Hills       | 3-5 tiles |
| Forest      | 1-2 tiles (becomes a trail) |

### Water Crossings (`+` on world map)

- **Ford**: Light blue `=` signs — shallow passable water, 5 tiles wide.
- **Bridge**: Brown or gray `=` signs — solid structure, 5 tiles wide.
- Ford vs. bridge determination is case-by-case (future design work).
- Road pathfinding has a special low cost at ford/bridge tile locations to route through designated crossings.

## Trails (Future Work)

Trails are 1-tile-wide networks connecting small points of interest (farmhouses, ruins, etc.). They meander through terrain, branch, and sometimes dead-end. More common near POIs. Generated as interconnected networks, not random walks. Details deferred to a future design.

## World Map Navigation

### Visibility States

| State         | Appearance    | Behavior                                      |
|---------------|--------------|-----------------------------------------------|
| Unexplored    | Hidden/black | Cannot enter                                  |
| Visible       | Dim colors   | Within ~2 tile radius of player. Entering forces transition to local view |
| Visited       | Bright colors| Walk across freely on world map               |

### Movement Rules

- Player moves freely across visited tiles on the world map.
- Stepping onto a visible-but-unvisited tile transitions to local view — player must play through at local scale.
- Walking off the edge of a local tile shifts to the neighboring world tile; player appears on the opposite edge.
- Visited state stored as a bitmap (~4KB for the full world map).
- Future refinement: free world-map travel restricted to roads; off-road requires local view even for visited tiles.

## ECS Integration

### New Components

- `LocalPosition(wx, wy, lx, ly)` — player position in both coordinate systems.
- `ViewMode('world' | 'local')` — active view.

### New Systems

- `LocalMapGeneratorSystem` — generates 43x43 local grids on demand.
- `LocalViewportSystem` — maintains 51x51 viewport in local view, triggers neighbor generation.
- `LocalRenderSystem` — creates StyledTile[][] from local tile data.
- `LocalMovementSystem` — handles local-scale movement with terrain collision.

### New Data

- `LocalMapCache` — in-memory cache of generated grids, keyed by `(wx, wy)`. Persisted to IndexedDB.
- Extended river preprocessing — per-river-tile distance from source and total river length.

### System Execution

Existing world map systems remain untouched, activated when `ViewMode = 'world'`. New local systems activate when `ViewMode = 'local'`. Mode switching triggers generation of the 3x3 tile neighborhood.
