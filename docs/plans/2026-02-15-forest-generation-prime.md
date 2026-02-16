# Forest Generation Tuning Guide

Previous docs:
- [Local Map Generation Design](2026-02-15-local-map-generation-design.md) — parent architecture for all local terrain
- [Forest Generation Design](2026-02-15-forest-generation-design.md) — algorithm design and density curve rationale
- [Forest Generation Plan](2026-02-15-forest-generation-plan.md) — implementation plan (all tasks complete)

## Purpose

The forest generation system is implemented and running. This document is a tuning guide for iterative human playtesting. A developer-agent reads this, the human playtester reports what they see, and the agent adjusts parameters in a tight feedback loop.

## How to Test

```bash
cd /Users/cmerck/src/chrismerck/mandos2/.worktrees/forest-generation
npm start
```

In the browser:
1. Navigate to a location on the world map
2. Press `M` to enter local view
3. Walk around — `T` blocks, `&`/`"`/`.` are passable
4. Press `M` to return to world map

Key test locations (world coordinates shown as `Position(x, y)`):
- **Hobbiton** (145, 49) — plains near forest edge; expect sparse trees
- **Old Forest** — east of Hobbiton; depth 1-3; expect moderate woodland
- **Mirkwood center** (~350, 55) — deep forest; expect near-impassable density
- **Fangorn** (~260, 95) — deep forest with mountain adjacency
- **Forest edge anywhere** — should see smooth gradient from trees to plains

After changing parameters: the dev server hot-reloads, but **generated tiles are cached in memory**. You must refresh the browser (F5) to regenerate tiles with new parameters.

## Theory of Operation

### Pipeline Overview

```
World map tile (wx, wy)
  → Forest depth lookup (preprocessed BFS, 0-37)
  → Density curve lookup (depth → treeDensity, brambleMargin, herbMargin)
  → 3x3 density grid from world tile + 8 neighbors
  → For each cell in 51x51 work grid:
      → Global coords: gx = wx*43 + localOffset, gy = wy*43 + localOffset
      → 3-octave simplex noise at global coords → normalized to [0, 1]
      → Bilinear interpolation of density from 3x3 grid
      → Threshold: noise < treeDensity → T, < +bramble → &, < +herb → ", else .
  → 2 passes cellular automata (smooth into organic clumps)
  → Trim 4-cell border → 43x43 result
```

### Why Each Stage Matters

**Forest depth** (preprocessed): Controls how "deep" each world tile is into a forest. BFS seeds from open terrain only — mountains, ocean, and rivers are barriers, so forest adjacent to mountains gets high depth (stays dense). Depth drives the density curve lookup.

**Density curve**: Maps depth → three thresholds that partition the noise range [0,1] into terrain types. Higher treeDensity = more of the noise range maps to trees. The margins create transition zones (brambles near treeline, herbs further out).

**Simplex noise**: A single continuous function over all 2D space. Adjacent tiles sample neighboring points, guaranteeing seamless edges. Three octaves at scales 20/10/5 with weights 1.0/0.5/0.25 create fractal-like variation. The noise function is deterministic from the seed.

**Bilinear interpolation**: Density values are centered at world tile centers. Between tiles, density blends smoothly. This prevents hard density jumps at tile boundaries. The 3x3 neighborhood means the generator sees one tile in each direction.

**Cellular automata**: Post-processes the noise threshold output. Removes isolated single trees (< 2 tree neighbors → becomes bramble). Fills small gaps in dense areas (>= 5 tree neighbors → becomes tree). Creates organic clump shapes instead of noise speckle. The 4-cell border means CA has context from the neighboring tile's noise, so edges match.

### What Controls What

| Observation | Likely cause | Tuning lever |
|---|---|---|
| Too many/few trees overall | Density curve too high/low | `FOREST_DENSITY_CURVE[depth].treeDensity` |
| Trees too uniform/speckly | Noise octaves wrong scale | `sampleNoise` frequency divisors (20, 10, 5) |
| No organic clumps, just dots | CA too weak or disabled | CA thresholds and pass count |
| Too blobby, no detail | CA too aggressive | Reduce CA passes or loosen thresholds |
| Hard edges at tile boundaries | Interpolation broken | `interpolateDensity` math |
| Forest-to-plains too abrupt | Depth 1 density too high | Lower `FOREST_DENSITY_CURVE[1]` values |
| Deep forest not dense enough | High-depth density too low | Raise `FOREST_DENSITY_CURVE[5+]` values |
| Bramble/herb zones too narrow | Margins too small | Increase `brambleMargin` / `herbMargin` |
| Bramble/herb zones too wide | Margins too large | Decrease margins |
| Can't navigate deep forest at all | treeDensity too high at depth 6+ | Lower max density or add clearings |
| Forest against mountains too thin | BFS seeding includes mountains | Check `forest_depth_preprocessing.py` — mountains should NOT be seeds |

## Tunable Files — Quick Reference

### `src/core/local/ForestDensityConfig.ts`

The primary tuning file. Array of 7 entries indexed by forest depth (0 through 6+):

```typescript
export const FOREST_DENSITY_CURVE: DensityEntry[] = [
  { treeDensity: 0.00, brambleMargin: 0.00, herbMargin: 0.00 },  // depth 0 (not forest)
  { treeDensity: 0.12, brambleMargin: 0.03, herbMargin: 0.05 },  // depth 1 (forest edge)
  { treeDensity: 0.25, brambleMargin: 0.05, herbMargin: 0.06 },  // depth 2
  { treeDensity: 0.40, brambleMargin: 0.07, herbMargin: 0.06 },  // depth 3
  { treeDensity: 0.55, brambleMargin: 0.10, herbMargin: 0.05 },  // depth 4
  { treeDensity: 0.65, brambleMargin: 0.12, herbMargin: 0.04 },  // depth 5
  { treeDensity: 0.75, brambleMargin: 0.15, herbMargin: 0.03 },  // depth 6+
];
```

- `treeDensity`: Fraction of noise range that maps to `T`. Range 0.0-1.0.
- `brambleMargin`: Width of the `&` band above treeDensity. Typically 0.03-0.15.
- `herbMargin`: Width of the `"` band above bramble. Typically 0.03-0.06.
- Remaining noise range (1.0 - treeDensity - brambleMargin - herbMargin) maps to `.` ground.

You can extend the array for more depth granularity. Depths beyond the array length clamp to the last entry.

### `src/core/local/LocalMapGenerator.ts`

#### Noise parameters (lines 94-100)

```typescript
private sampleNoise(gx: number, gy: number): number {
  const n1 = this.noise1(gx / 20, gy / 20) * 1.0;   // large-scale terrain shape
  const n2 = this.noise2(gx / 10, gy / 10) * 0.5;   // medium detail
  const n3 = this.noise3(gx / 5, gy / 5) * 0.25;    // fine detail
  const raw = n1 + n2 + n3;
  return (raw + 1.75) / 3.5;  // normalize to [0, 1]
}
```

Tuning:
- **Frequency divisors** (20, 10, 5): Larger = broader blobs. Smaller = tighter variation. The ratio between octaves matters more than absolute values.
- **Octave weights** (1.0, 0.5, 0.25): Standard 1/2 falloff. Increasing weight of higher octaves adds more fine detail. Decreasing makes terrain smoother.
- **Normalization**: The `1.75` and `3.5` values are derived from `1.0 + 0.5 + 0.25 = 1.75` (max amplitude). If you change weights, update normalization: `maxAmplitude = sum of weights`, then `(raw + maxAmplitude) / (2 * maxAmplitude)`.
- Adding a **4th octave** (e.g., `gx/2.5` at weight 0.125) would add pixel-level variation.

#### Cellular automata (lines 138-160)

```typescript
private applyCellularAutomata(grid: string[][]): void {
  for (let pass = 0; pass < 2; pass++) {                    // ← pass count
    const snapshot = grid.map(row => [...row]);
    for (let y = 1; y < WORK_SIZE - 1; y++) {
      for (let x = 1; x < WORK_SIZE - 1; x++) {
        let treeNeighbors = 0;                               // ← counts T in 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (snapshot[y + dy][x + dx] === 'T') treeNeighbors++;
          }
        }
        if (snapshot[y][x] === 'T' && treeNeighbors < 2) {  // ← death threshold
          grid[y][x] = '&';                                  // ← what isolated trees become
        } else if (snapshot[y][x] !== 'T' && treeNeighbors >= 5) { // ← birth threshold
          grid[y][x] = 'T';                                  // ← what filled gaps become
        }
      }
    }
  }
}
```

Tuning:
- **Pass count** (currently 2): More passes = smoother, rounder clumps. 0 passes = raw noise (speckly). 1 = light smoothing. 3+ = very blobby, cave-like.
- **Death threshold** (currently < 2): A tree with fewer than this many tree neighbors dies. Lower = more tolerant of isolated trees. Set to 0 to never kill trees.
- **Birth threshold** (currently >= 5): A non-tree with this many or more tree neighbors becomes a tree. Lower = more aggressive gap-filling. Higher = more permeable forest. Range 4-7 is typical.
- **Death product** (currently `'&'`): What a dying tree becomes. Could be `'.'` (ground) or `'"'` (herbs) instead.
- **Multi-character CA**: The current CA only considers `T` vs non-`T`. A more sophisticated version could also evolve `&` and `"` based on their own neighbor rules.

Possible enhancements:
- **Directional bias**: Weight north/south neighbors differently to create elongated clearings.
- **Stochastic CA**: Add randomness to birth/death decisions for more irregular shapes.
- **Different rules per pass**: First pass aggressive smoothing, second pass conservative.

#### Border size (line 7)

```typescript
const BORDER = 4;
```

The border ensures CA has context from neighboring tiles. Must be >= CA pass count * CA radius. With 2 passes of radius-1 CA, border 4 is safe. If you increase CA passes or radius, increase the border.

#### Bilinear interpolation (lines 54-92)

Centers density values at tile centers (0.5, 0.5 in normalized tile space). The math maps local coordinates to blending weights between the 4 nearest world tile centers. This should not need tuning unless you want sharper or softer transitions (in which case, consider a different interpolation kernel like smoothstep).

### `src/core/systems/LocalRenderSystem.ts`

Terrain colors for the local view (lines 8-19):

```typescript
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
```

Available colors (from `Renderable.ts`): `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, `grey`, `redBright`, `greenBright`, `yellowBright`, `blueBright`, `magentaBright`, `cyanBright`, `whiteBright`. Styles can also set `bold: true` and `dim: true`.

### `src/core/systems/LocalMovementSystem.ts`

Collision rules (line 51):

```typescript
if (destTile === 'T' || destTile === '#' || destTile === '=') return;
```

To make brambles (`&`) slow instead of block, you'd need a movement speed/delay system (not yet implemented). Currently all passable terrain has the same speed.

### `scripts/forest_depth_preprocessing.py`

BFS seeding (lines 96-105):

```python
open_terrain = set(' .,%o~')
for r in range(H):
    for c in range(W):
        if grid[r][c] in open_terrain:
            queue.append((r, c, 0))
            visited.add((r, c))
```

Only open terrain seeds the BFS. Mountains (`^`), ocean (`=`), rivers (`-`, `|`) are barriers — forest touching them remains "deep." Changing this set changes which world tile types count as "forest edge."

After modifying this file, re-run: `npm run preprocess-forests` and refresh the browser.

## Iteration Workflow

1. Human playtester reports observation (e.g., "forest is too sparse at depth 3")
2. Agent identifies the relevant parameter (e.g., `treeDensity` at index 3)
3. Agent edits the file
4. Human refreshes browser, navigates to test location, presses `M`
5. Human reports result
6. Repeat

Changes to `ForestDensityConfig.ts`, `LocalMapGenerator.ts`, and `LocalRenderSystem.ts` are picked up by Vite hot-reload but require a browser refresh to clear the tile cache. Changes to `forest_depth_preprocessing.py` require re-running `npm run preprocess-forests` and a browser refresh.

## Architecture Constraints

- **Seamlessness**: Any parameter change must preserve seamless tile boundaries. The noise is inherently seamless (global coordinates). The density interpolation is seamless (bilinear). The CA is seamless via the 4-cell border. Don't break these invariants.
- **Determinism**: Same seed + same parameters = same output. The mulberry32 PRNG is deterministic. Don't introduce `Math.random()`.
- **Cache invalidation**: The `LocalMapCache` is in-memory only. Changing generation parameters doesn't invalidate cached tiles — must refresh browser.
- **43x43 tile size**: Hardcoded as `TILE_SIZE = 43` in multiple files. Changing this requires coordinating `LocalMapGenerator.ts`, `LocalViewportSystem.ts`, `LocalMovementSystem.ts`, and `LocalPosition.ts` defaults.
- **51x51 viewport**: `VIEWPORT_SIZE = 51` in `LocalViewportSystem.ts`. This is the visible window size. Can be changed independently of tile size.

## Ideas for Future Tuning Enhancements

- **Clearings in deep forest**: A separate low-frequency noise layer that carves small open areas in depth 4+. The design doc describes this as Step 5 (not yet implemented).
- **Tree species variation**: Use a second noise layer to assign tree subtypes (e.g., `T` oak, `t` birch) based on region or depth.
- **Path guarantee**: In very dense forest, A* a narrow walkable path to ensure the player isn't completely walled off.
- **Terrain-specific CA rules**: Different CA rules for brambles and herbs, not just trees.
