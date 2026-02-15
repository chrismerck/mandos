# Forest Generation Design

Parent design: [Local Map Generation Design](2026-02-15-local-map-generation-design.md)

## Overview

First implementation target for the local map system. Generates forest terrain at the local tile level using simplex noise with cellular automata post-processing. Covers forest tiles, forest edges, and adjacent plains with tree proximity decay.

## Forest Depth Preprocessing

A new preprocessing step mirroring mountain depth:

- BFS from all non-`&` tiles, assigning each `&` tile its distance to the nearest non-forest tile.
- Binary format: magic "FDEP", version u16, width u16, height u16, uint8 per tile.
- TypeScript loader `ForestData.ts` mirrors `MountainData.ts`.
- Python script mirrors `mountain_depth_preprocessing.py`, targeting `&` instead of `^`.
- Expected max depth in Middle Earth: ~8-10 (deep Mirkwood).

## Generation Pipeline

For a world tile at `(wx, wy)`:

### Step 1: Noise Sampling (51x51)

Sample multi-octave simplex noise at global coordinates with a 4-cell border around the 43x43 tile:

```
for ly in -4..46:
    for lx in -4..46:
        gx = wx * 43 + lx
        gy = wy * 43 + ly

        n  = 1.0  * simplex(gx/20.0, gy/20.0, SEED)
        n += 0.5  * simplex(gx/10.0, gy/10.0, SEED+1)
        n += 0.25 * simplex(gx/5.0,  gy/5.0,  SEED+2)
        n = normalize(n)  // map to [0, 1]
```

Global coordinates ensure seamless noise across tile boundaries.

### Step 2: Initial Placement (51x51)

Threshold noise into terrain characters. Density from bilinear interpolation of the 3x3 world tile neighborhood's density values:

```
density = interpolateDensity(densityGrid3x3, lx, ly)

if n < density:
    cell = 'T'
else if n < density + brambleMargin:
    cell = '&'    // brambles near tree line
else if n < density + brambleMargin + herbMargin:
    cell = '"'    // herbs further out
else:
    cell = '.'    // open ground
```

### Step 3: Cellular Automata (51x51, 2 passes)

Smooth the noise into organic clumps:

```
for pass in 1..2:
    for each cell:
        treeNeighbors = count 'T' in 8 neighbors

        if cell == 'T':
            if treeNeighbors < 2: cell = '&'    // isolated tree becomes brambles
        else:
            if treeNeighbors >= 5: cell = 'T'   // gap fills in if heavily surrounded
```

Effects: lone trees absorbed into undergrowth, dense areas solidify, edges become natural curves.

### Step 4: Trim to 43x43

Discard the 4-cell border. The border exists solely to provide CA context so that adjacent tiles produce matching results at shared edges.

### Step 5: Clearings (future, after base tuning)

In deep forest (depth 4+), rare small clearings carved using a separate low-frequency noise layer. Clearings must not cross tile boundaries — only place a clearing where `clearingRadius < min(lx, ly, 42-lx, 42-ly)`.

## Seamlessness

Two properties ensure tiles match at boundaries without stored boundary conditions:

1. **Simplex noise** is sampled at global coordinates — a single continuous function over all of 2D space. Adjacent tiles sample neighboring points of the same function.
2. **Density modulation** is bilinearly interpolated between world tile centers — smooth by construction.
3. **CA border**: The 4-cell oversample means CA influence from neighboring tiles is accounted for. Both neighbors produce identical noise in the overlap region, so CA results match.

## Density Curve

Starting values — to be tuned empirically:

| Depth | Tree density | Bramble margin | Herb margin | Feel |
|-------|-------------|----------------|-------------|------|
| 0     | 0.00        | 0.00           | 0.00        | Not forest |
| 1     | 0.12        | 0.03           | 0.05        | Lone trees + small copses |
| 2     | 0.25        | 0.05           | 0.06        | Light woodland |
| 3     | 0.40        | 0.07           | 0.06        | Moderate forest |
| 4     | 0.55        | 0.10           | 0.05        | Dense, maze-like |
| 5     | 0.65        | 0.12           | 0.04        | Very dense |
| 6+    | 0.75        | 0.15           | 0.03        | Near-impassable |

These values will be stored in a configuration object for easy adjustment during testing.

### Non-forest Tree Proximity

Plains and hills adjacent to forest get scattered trees via the bilinear interpolation. A plains tile center has density ~0.0; near the forest edge, the interpolation blends toward the forest tile's density, producing natural tree scatter that decays with distance.

## Character Set (Forest Context)

| Char | Meaning              | Movement  | Color         |
|------|----------------------|-----------|---------------|
| `T`  | Tree                 | Blocks    | Green         |
| `.`  | Ground / path        | Walkable  | Brown on roads, gray otherwise |
| `&`  | Brambles             | Slows     | Dark green    |
| `"`  | Herbs / low vegetation | Walkable | Yellow-green  |

## First Implementation Scope

### In scope:
- Forest depth preprocessing (Python script + FDEP binary + ForestData.ts loader)
- Forest tile generation pipeline (noise → placement → CA → trim)
- Bilinear density interpolation from 3x3 world neighborhood
- Plains tiles adjacent to forest (proximity decay via interpolation)
- 51x51 square viewport rendering for local view
- Local movement with terrain collision (T blocks, & slows)
- Mode switching with `M` hotkey (world map ↔ local view)

### Out of scope:
- Rivers, streams, roads, trails
- Mountains, hills, marshes
- Clearings (add after base forest is tuned)
- Fog of war on world map
- IndexedDB persistence
- Visited-tile tracking and free world-map movement

### Test approach:
Navigate to a known forest edge on the world map (e.g., Old Forest near Hobbiton), press `M` to enter local view, observe the generated forest, walk around. Tune density curve and CA parameters based on visual feedback.
