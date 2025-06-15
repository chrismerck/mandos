# Designing On-disk & In-memory Data for Instant Loading in Roguelikes

---

## 1. Pre-compute Once, Load Instantly (< 50 ms)

Because the Voronoi step is $O(|V| \log |V|)$, it's significantly faster to run this step offline and cache the result.

Use a Make-style rule:

```makefile
REGION_GRID.bin : middle_earth.worldmap map_resolve.py
	python map_resolve.py middle_earth.worldmap REGION_GRID.bin POI.csv
```

GNU Make rebuilds artifacts only when the ASCII map or resolver script changes.

---

## 2. Essential In-game Data

| Lookup                                   | Usage                                | Frequency                           |
| ---------------------------------------- | ------------------------------------ | ----------------------------------- |
| Terrain glyph → movement cost, LOS flags | Every pathfinding step               | Very Frequent                       |
| Realm ID + sub-region ID of tile         | World-map UI, diplomacy, quest hooks | Rare (UI refresh, quest generation) |
| Named POIs list                          | Spawning towns/dungeons              | Rare (load once)                    |

---

## 3. Recommended Artifact Formats

### 3.1 Binary "Super-Tile" Blob (fastest)

```cpp
struct Tile32 {
    uint8_t terrain;    // index into 256-entry cost/LOS table
    uint8_t realm_id;   // 0-255 (0 = unclaimed/void)
    uint8_t sub_id;     // 0-255 (0 = none)
    uint8_t flags;      // bit-flags: is_river, is_ocean, has_road, etc.
};
```

* Fixed 4 bytes/cell → a 600×400 map ≈ 0.9 MB.
* Single fread(), then indexing via `tile = grid[y*W + x]`.
* Terrain costs stored globally (256-entry table), easily tweakable without blob rewrite.

### 3.2 Optional Compression Layers

| Technique   | Benefit                            | Trade-off                                  |
| ----------- | ---------------------------------- | ------------------------------------------ |
| RLE on rows | \~75% smaller (large oceans/voids) | Negligible decode cost                     |
| zstd / LZ4  | Disk shrinks < 200 KB              | Decompress into RAM at startup (sub-10 ms) |

For roguelikes, memory rarely matters; simplicity is usually preferable.

### 3.3 POI Catalogue (CSV or JSON)

```
name,row,col,realm_id,sub_id,type
Minas_Tirith,420,133,6,17,City
Henneth_Annûn,412,129,6,17,Hideout
...
```

Load once into `std::vector<POI>`.

---

## 4. Runtime Memory Layout

```cpp
struct WorldMap {
    int W, H;
    Tile32* tiles;                 // contiguous memory; owned by unique_ptr
    std::vector<POI> pois;         // town/dungeon metadata
    const TerrainDef* terrainLUT;  // movement, LOS, sprite ID
};
```

* Pathfinding accesses `terrainLUT[tile.terrain].moveCost`.
* Faction logic checks `tile.realm_id`.
* Renderer uses `sub_id` or `realm_id` for palettes.

Hot loop uses only contiguous arrays—no dynamic allocation.

---

## 5. Versioning & Rebuild Safety

* Magic header in blob: `"REG1"` + hash of map spec, resolver version, build-time constants.
* Loader verifies hash; mismatches print: `"Stale region grid—run make"` and quit.
* POI CSV and blob always stored together to synchronize updates.

---

## 6. Performance & Convenience

| Property                    | Explanation                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| Cold start ≤ 50 ms          | 0.9 MB fread + direct pointer assignment; no parsing.                  |
| No cache misses in hot path | Costs and glyph data stored contiguously, optimizing cache line usage. |
| Mod-friendly                | ASCII file edits trigger rebuild; no executable changes needed.        |
| Easy extension              | Add new fields (e.g., humidity) in v2 header; update magic number.     |

---

## 7. Alternative: No Pre-computation (Not Recommended)

* Perform lightweight flood-fill on accessible map portions only.
* Requires complex chunk streaming and cache invalidation.
* Generally, pre-baked blobs are simpler and more efficient.

