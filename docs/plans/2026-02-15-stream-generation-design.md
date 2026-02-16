# Stream Generation Design

Parent design: [Local Map Generation Design](2026-02-15-local-map-generation-design.md)

## Overview

Generates rivers and streams at local tile scale. Forest generates first (unchanged), then streams carve through it. Requires a new preprocessing step to trace river topology and compute accumulated flow, which determines width.

## River Flow Preprocessing

### Algorithm

1. Scan the world map for river tiles (`-`, `|`, `+`).
2. Group into connected components via 4-connected flood fill.
3. **Diagnostic**: flag any component with no ocean (`=`) neighbor — these are broken rivers that need map fixes. Print a 30x30 map context around the tile nearest to ocean.
4. Identify sources: tiles with exactly 1 river neighbor (dead ends at river headwaters).
5. Topological trace from sources to mouths:
   - Start at each source with flow = 1.
   - Walk downstream (toward tiles with more river neighbors / toward ocean).
   - At each tile, flow = distance walked from source.
   - At junctions where tributaries merge: downstream flow = sum of all upstream tributary flows.
6. Store per-tile: component ID, accumulated flow.
7. Store per-component: max flow (the flow value at the mouth).

### Topological Sort

The river graph is a directed acyclic graph (sources → mouths). Process order:

1. Build adjacency list of river tiles.
2. Identify sources (in-degree 1, only connected downstream).
3. For each source, trace downstream. At junctions (3+ river neighbors), a tile is "ready" when all upstream tributaries have been processed.
4. Use a queue: start with all sources. When a tile is processed, check if its downstream neighbor is now ready. If so, enqueue it.
5. Downstream direction heuristic: among a tile's river neighbors, "downstream" is the neighbor(s) farther from all sources (or toward ocean).

### Flow-to-Width

Width is computed at local generation time from the preprocessed flow:

```
normalizedFlow = accumulatedFlow / componentMaxFlow
localWidth = max(1, round(sqrt(normalizedFlow) * 20))
```

The square root models the physical relationship where cross-sectional area (width × depth) scales linearly with drainage, but width ∝ √(area) since depth also increases. Result: a river 4× further from its source is 2× wider, not 4×.

Small streams (few tiles from source): 1-2 local tiles wide.
Major rivers (Anduin near its mouth): up to 20 local tiles wide.
Max capped at 20 — rivers are imposing but leave room for banks within a 43-tile-wide local tile.

### Binary Format: `RFLW`

File: `maps/middle_earth_river_flow.bin`

```
Header:
  magic:   "RFLW" (4 bytes)
  version: u16 (1)
  width:   u16 (map width)
  height:  u16 (map height)

Per-tile grid (width × height):
  For non-river tiles: all zeros (3 bytes)
  For river tiles:
    componentId: u8  (1-254, 0 = not a river, 255 = reserved)
    flow:        u16 (accumulated flow value, little-endian)

Component table:
  count: u8
  Per component:
    maxFlow: u16 (the max flow in this component)
```

### Diagnostic Output

During preprocessing, print to stdout:

```
RIVER DIAGNOSTICS:
  Component 1: 342 tiles, max flow 342, reaches ocean: YES
  Component 2: 28 tiles, max flow 28, reaches ocean: NO
    Nearest ocean tile: (125, 45), distance: 3
    30x30 map context around (125, 45):
    [... ASCII map excerpt ...]
```

## Local Stream Generation

### Pipeline Position

Stream generation runs after the full forest pipeline (noise → CA → diffusion → trails → clumping → trim) and overlays water on top. The `generateTile` method gains a new final step.

### Entry/Exit Points

For a river world tile at `(wx, wy)`, determine where the stream enters and exits the 43×43 local tile.

Crossing points at tile boundaries use a shared hash so both neighboring tiles agree:

```
// Vertical edge between (wx, wy) and (wx+1, wy):
crossingY = hash(min(wx, wx+1), max(wx, wx+1), wy, RIVER_SEED) % 33 + 5

// Horizontal edge between (wx, wy) and (wx, wy+1):
crossingX = hash(wx, min(wy, wy+1), max(wy, wy+1), RIVER_SEED) % 33 + 5
```

Range [5, 37] keeps crossings away from corners.

### Direction & Neighbor Detection

Which sides of the tile have entry/exit points depends on the world map character and its river neighbors:

- **`-` tile**: check for river neighbors east and west. If present, place entry/exit on those edges.
- **`|` tile**: check for river neighbors north and south.
- **`+` tile**: check all four directions.
- **Any tile** may also have river neighbors on non-primary sides (e.g., a `-` tile with a `|` neighbor to the south). These create tributary junctions.

A tile with only 1 river neighbor is a source — the stream originates inside the tile at a noise-determined point near the non-connected center.

### Path Through Tile

Connect entry/exit points with midpoint displacement:

1. Straight line from entry to exit.
2. Displace midpoint perpendicular to flow direction using deterministic noise seeded from `(wx, wy, RIVER_SEED)`.
3. Recurse 2-3 times for natural curves.
4. Displacement magnitude scales inversely with width: narrow streams meander more, wide rivers are straighter.

For tiles with 3+ entry/exit points (junctions):
- Identify the main channel (highest flow) and tributaries.
- Route the main channel first (entry → exit with highest flow).
- Route each tributary from its entry point to the nearest point on the main channel.
- Tributary width transitions to the combined width downstream of the merge.

### Rasterization

For each point along the path, stamp `=` in a corridor of the computed width:

```
for each path segment:
  perpendicular = normal to segment direction
  for offset in [-width/2, +width/2]:
    tile at (pathPoint + perpendicular * offset) = '='
```

### Forest Interaction

- Forest generates first, completely unaware of streams.
- Stream overlay replaces whatever character is at each water tile with `=`.
- No bank clearing — trees grow right to the water's edge.
- This creates the visual effect of streams cutting channels through forest.

### Seamlessness

Three properties ensure tiles match at boundaries:

1. **Crossing points** are computed from shared hashes — both neighbors produce identical entry/exit positions.
2. **Width** comes from preprocessing — the same flow value at the shared edge yields the same width.
3. **Midpoint displacement** uses deterministic noise seeded from tile coordinates — same seed produces same path.

## TypeScript Data Loader

New class: `src/core/data/RiverFlowData.ts`

Mirrors `ForestData.ts` pattern:

```typescript
class RiverFlowData {
  static async load(dataLoader: DataLoader): Promise<RiverFlowData>
  isRiver(x: number, y: number): boolean
  getFlow(x: number, y: number): { componentId: number, flow: number, maxFlow: number } | null
  getRiverNeighborDirections(wx: number, wy: number): Direction[]
}
```

`getRiverNeighborDirections` checks the 4 cardinal neighbors on the world map for river tiles, returning which sides of the local tile have stream entry/exit points.

## Integration

### Constructor Change

`LocalMapGenerator` gains a `RiverFlowData` parameter:

```typescript
constructor(
  mapData: MapData,
  forestData: ForestData,
  riverFlowData: RiverFlowData,
  seed: number
)
```

### generateTile Change

After the existing forest pipeline and trim step, add stream overlay:

```typescript
generateTile(wx, wy): string[][] {
  // ... existing forest pipeline ...
  const result = this.trimBorder(work);
  this.overlayStreams(result, wx, wy);  // NEW
  return result;
}
```

### No Other Changes Needed

- `LocalMovementSystem` already blocks on `=`.
- `LocalRenderSystem` already renders `=` as `blueBright`.
- `LocalMapCache` works unchanged — it just caches the final tile output.

## Scope

### In scope:
- River flow preprocessing (Python script + RFLW binary + RiverFlowData.ts loader)
- Disconnected river diagnostic (30x30 context)
- Stream overlay in LocalMapGenerator (entry/exit, midpoint displacement, rasterization)
- Junction handling (tributaries merging)
- Width from sqrt of normalized flow, max 20

### Out of scope:
- Roads, trails
- Bridge/ford rendering at `+` tiles (future)
- Ocean tile generation
- Water current / flow direction display
- Riverbank terrain features (sand, mud)
- Fish, boats, or other water-specific entities
