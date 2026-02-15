# POI & River Name Detection Design

## Goal

Detect Points of Interest (towns marked with `o` tiles) and rivers/roads from the ASCII map, associate them with their `!Name` and `@Name` labels, and display the name in brackets when the player walks on that tile.

## Map Label Patterns

- `!Name` — POI label (e.g., `!Hobbiton`, `!Rivendell`). The `!` position is near an `o` tile (the actual town marker). The label and `o` may be on different rows or diagonal from each other.
- `@Name` — River or road label (e.g., `@R_Anduin`, `@East_Road`). The `@` position is near connected river (`|`, `-`, `+`) or road (`.`) tiles. Whether it's a river or road is determined by which terrain type the BFS reaches first.
- `o` — Town marker tile on the map (the walkable location for a POI).

## Preprocessing (Python)

New module: `scripts/poi_river_preprocessing.py`

### POI Detection

1. Scan map for `!Name` labels, recording the `!` position and extracted name.
2. For each `!Name`, BFS outward (8-connected) from the `!` position to find the nearest `o` tile.
3. Associate the name with that `o` tile coordinate.

### River/Road Detection

1. Scan map for `@Name` labels, recording the `@` position and extracted name.
2. **Simultaneous BFS from ALL `@` positions** — each label radiates outward. The first river tile (`|`, `-`, `+`) or road tile (`.`) reached determines whether it's a river or road name.
3. **Flood-fill per type** — once the type is determined, flood-fill from the seed tile along all connected tiles of that type.
4. **Stop conditions**: don't flood into ocean (`=`) tiles; when two named rivers/roads collide, stop (first-come-first-served).

### Label Cleanup

After extracting `!Name` and `@Name` labels, blank the label text from the grid (restore underlying terrain or space), similar to how `?Name` and `[Name]` labels are already cleaned.

### Output

New binary file: `maps/middle_earth_poi_rivers.bin`

Format (`POI1`):
```
Header:   "POI1" (4 bytes) + version:u16 + W:u16 + H:u16
Per-tile: 1 byte POI/river ID (255 = none)
Names:    count:u8 + [length:u8 + utf8_bytes]...
```

Each tile maps to at most one POI/river/road name.

## TypeScript Loading

New class or extension to load `middle_earth_poi_rivers.bin`:
- `getPoiName(x, y): string | null` — returns the POI/river/road name for a tile, or null.

## Display

- **On a POI/river/road tile**: Status bar shows `[Hobbiton]` or `[R. Anduin]` — the name in brackets, replacing the realm/region display entirely.
- **Not on a POI tile**: Normal region display as before (`Gondor - Belfalas`).

### Name Formatting

- Replace underscores with spaces: `Michel_Delving` -> `Michel Delving`
- River prefix: `R_Anduin` -> `R. Anduin`

## Integration Points

### Python
- `scripts/poi_river_preprocessing.py` — new module
- `scripts/map_preprocessing.py` — call the new module, generate the binary file
- `npm run preprocess` — already runs map_preprocessing.py, will pick up the new output

### TypeScript
- `src/core/data/RegionData.ts` or new `PoiRiverData.ts` — load the POI1 binary file
- `src/core/components/RegionInfo.ts` — add `poiName: string` field
- `src/core/systems/RegionDisplaySystem.ts` — query POI data, set poiName when on a POI tile
- `src/web/WebGame.tsx` — when `poiName` is set, display `[poiName]` instead of realm/region
