# Geographic Features Labeling Plan

## Overview

Geographic features are named terrain regions (mountain ranges, forests, hills, marshes, bodies of water) that provide an additional layer of naming on top of the realm/sub-region system. Unlike regions which are confined to a single realm, geographic features can span multiple realms and act as natural borders.

## Requirements

1. **Terrain Types**: Geographic features apply to:
   - Mountains (`^`) - e.g., "Misty Mountains", "Blue Mountains"
   - Hills (`~`) - e.g., "Weather Hills", "Barrow-downs"
   - Forests (`&`) - e.g., "Mirkwood", "Fangorn Forest"
   - Marshes (`%`) - e.g., "Dead Marshes", "Midgewater Marshes"
   - Deep Water (`=`) - e.g., "Sea of Rhûn", "Bay of Belfalas"

2. **Label Detection**: Two types of geographic feature labels:
   - **Embedded labels**: Bare text within the terrain patch (e.g., "Mirkwood" inside forest tiles)
     - Must be 3+ characters to be considered a label
     - Can contain letters, underscores, apostrophes
   - **Adjacent labels**: `?Name` syntax placed in open space near the feature
     - e.g., `?Dead_Marshes` next to marsh tiles
     - Already defined in map.spec.md as "Natural region" annotations

3. **Flooding Rules**: Different from realm/region flooding:
   - Floods ONLY to connected tiles of the SAME terrain type
   - Rivers (`-`, `|`) and roads (`.`) are IGNORED (treated as if they were the underlying terrain)
   - This allows forests/mountains to be continuous across rivers/roads

4. **Priority**: Geographic feature names take precedence over region names in the final display

## Algorithm Design

### Phase 1: Label Detection and Terrain Restoration

1. **Scan for geographic labels** in the original grid:
   - **Embedded labels**: Alphabetic sequences of 3+ chars within terrain
   - **?-prefixed labels**: Parse `?Name` annotations
   - Record position, text, and type of each label
   - For embedded labels, note the surrounding terrain type
   - For ?-labels, identify nearest terrain feature

2. **Create terrain-restored grid**:
   - Copy original grid
   - For each detected label:
     - Embedded: Replace with inferred terrain from neighbors
     - ?-prefixed: Remove entire annotation (replace with space or inferred terrain)
   - Special handling for rivers/roads to maintain connectivity

### Phase 2: Connected Component Analysis

For each terrain type (`^`, `~`, `&`, `%`, `=`):

1. **Build connectivity mask**:
   - Create boolean mask for target terrain
   - When checking connectivity, treat `-`, `|`, `.` as "transparent"
   - i.e., if checking mountains, a river doesn't break connectivity

2. **Find connected components**:
   - Use flood-fill/BFS from each unvisited tile
   - Assign unique component ID to each connected region
   - Track which labels fall within each component

3. **Assign names to components**:
   - Match labels to components:
     - Embedded labels: Assign to the component they're physically within
     - ?-labels: Assign to the nearest connected component of matching terrain
   - If component has multiple labels, choose the longest/most significant
   - If no labels, leave unnamed

### Phase 3: Integration with Existing System

1. **Data Structure Updates**:
   - Add geographic feature ID to binary output (3rd byte per tile)
   - Add geographic feature name lookup table
   - Extend POI CSV with geographic features

2. **Display Priority**:
   - When showing location to player:
     - If tile has geographic feature name, show that
     - Otherwise show realm/region as before
   - Format: "Misty Mountains" or "Gondor - Ithilien"

## Implementation Steps

### Step 1: Extend Label Detection
```python
def detect_geographic_labels(grid, H, W):
    """Find both embedded and ?-prefixed geographic labels."""
    labels = []
    
    for r in range(H):
        c = 0
        while c < W:
            # Check for ?-prefixed labels
            if grid[r][c] == '?' and c + 1 < W:
                start_c = c
                c += 1  # Skip '?'
                label_chars = []
                while c < W and (grid[r][c].isalpha() or grid[r][c] in "_'"):
                    label_chars.append(grid[r][c])
                    c += 1
                if label_chars:
                    label_text = ''.join(label_chars)
                    # Find nearest terrain feature
                    terrain_type = find_nearest_terrain_feature(grid, H, W, r, start_c)
                    labels.append({
                        'text': label_text,
                        'row': r,
                        'start_col': start_c,
                        'end_col': c,
                        'terrain': terrain_type,
                        'type': 'adjacent'
                    })
            # Check for embedded labels
            elif grid[r][c].isalpha():
                start_c = c
                label_chars = []
                while c < W and (grid[r][c].isalpha() or grid[r][c] in "_'"):
                    label_chars.append(grid[r][c])
                    c += 1
                if len(label_chars) >= 3:
                    label_text = ''.join(label_chars)
                    # Infer terrain type from surroundings
                    terrain_type = infer_terrain_type(grid, H, W, r, start_c, c)
                    if terrain_type in {'^', '~', '&', '%', '='}:
                        labels.append({
                            'text': label_text,
                            'row': r,
                            'start_col': start_c,
                            'end_col': c,
                            'terrain': terrain_type,
                            'type': 'embedded'
                        })
            else:
                c += 1
    return labels
```

### Step 2: Connected Components with Transparent Tiles
```python
def find_terrain_components(grid, H, W, terrain_type):
    """Find connected components of terrain, treating rivers/roads as transparent."""
    visited = np.zeros((H, W), bool)
    components = np.zeros((H, W), int) - 1
    component_id = 0
    
    transparent = {'-', '|', '.', '+'}  # These don't break connectivity
    
    def is_connected(r, c):
        if 0 <= r < H and 0 <= c < W:
            return grid[r][c] == terrain_type or grid[r][c] in transparent
        return False
    
    def flood_fill(start_r, start_c):
        queue = collections.deque([(start_r, start_c)])
        visited[start_r][start_c] = True
        components[start_r][start_c] = component_id
        
        while queue:
            r, c = queue.popleft()
            for dr, dc in [(0,1), (1,0), (0,-1), (-1,0)]:
                nr, nc = r + dr, c + dc
                if is_connected(nr, nc) and not visited[nr][nc]:
                    visited[nr][nc] = True
                    if grid[nr][nc] == terrain_type:
                        components[nr][nc] = component_id
                    queue.append((nr, nc))
    
    # Find all components
    for r in range(H):
        for c in range(W):
            if grid[r][c] == terrain_type and not visited[r][c]:
                flood_fill(r, c)
                component_id += 1
    
    return components, component_id
```

### Step 3: Binary Format Extension

Current format (REG1):
- Header: Magic (4) + Version (2) + Width (2) + Height (2) = 10 bytes
- Per tile: realm_id (1) + sub_id (1) = 2 bytes

New format (REG2):
- Header: Magic (4) + Version (2) + Width (2) + Height (2) = 10 bytes  
- Per tile: realm_id (1) + sub_id (1) + geo_feature_id (1) = 3 bytes
- Extended name tables for geographic features

## Testing Approach

1. **Unit Tests**:
   - Label detection with various terrain contexts
   - Connected component analysis with rivers/roads
   - Priority resolution (geo feature vs region)

2. **Visual Validation**:
   - Generate debug image showing geographic features in different colors
   - Verify known features: Misty Mountains spans multiple realms
   - Check forest continuity across rivers

3. **Integration Tests**:
   - Load in game and verify correct names displayed
   - Test movement across geographic boundaries
   - Ensure backward compatibility with existing code

## Considerations

1. **Performance**: Connected component analysis is O(W×H) per terrain type
2. **Memory**: Additional byte per tile (minimal impact)
3. **Ambiguity**: Some labels might be unclear which terrain they name
4. **Edge Cases**: Labels at terrain boundaries need careful handling

## Future Extensions

- Weather/climate zones based on geographic features
- Feature-specific random encounters (mountain orcs, forest elves)
- Movement modifiers based on named vs unnamed terrain
- Quest hooks tied to specific geographic features