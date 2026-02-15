# Mandos2 - Middle Earth Map Game

## Purpose
ADOM-inspired roguelike game for exploring a Middle Earth ASCII map using TypeScript with an Entity Component System (ECS) architecture. Web-based using Canvas 2D rendering.

## Architecture

### Structure
- **src/core/**: Game logic
- **src/web/**: Web UI using Canvas 2D
- **src/shared/**: Shared interfaces (DataLoader, StyledTile)

### ECS Core (`src/core/ecs/`)
- **Entity.ts**: Container with unique ID holding components via Map<string, Component>
- **Component.ts**: Interface with `type: string` property
- **System.ts**: Abstract class with `update(world: World, deltaTime: number)` method
- **World.ts**: Manages entities, runs systems, provides `getEntitiesWithComponent()`

### Components (`src/core/components/`)
- **Position.ts**: `x: number, y: number` - world coordinates
- **Renderable.ts**: `char: string, priority: number, color?: Color` - visual representation
- **Movable.ts**: `speed: number` - movement capability
- **Player.ts**: Tag component to identify player entity

### Systems (`src/core/systems/`)
- **InputSystem.ts**: Captures keyboard input, stores current Direction
- **MovementSystem.ts**: Updates Position based on InputSystem direction, checks collision
- **ViewportSystem.ts**: Maintains 80x20 view centered on player
- **RenderSystem.ts**: Creates StyledTile[][] combining map + entities
- **TerrainColors.ts**: Color mappings for terrain types

### Map Data (`src/core/data/`)
- **MapData.ts**: Loads ASCII worldmap asynchronously via DataLoader
- **RegionData.ts**: Loads binary region data and POI CSV
- **MountainData.ts**: Loads binary mountain depth data
- **DataLoader interface**: File loading via fetch()
  - **WebDataLoader**: Uses fetch() for web version
- Terrain types: `=` ocean, `-|` rivers (both use same blue color), `^` mountains, `&` forests, `.` roads, `o` towns
- Collision detection: Can't walk on `=`, `^`, or deep mountains

### Web UI (`src/web/`)
- **WebGame.tsx**: React game component with Canvas rendering
- **CanvasDisplay.tsx**: Renders StyledTile[][] on HTML5 Canvas
- **index.tsx**: Entry point using React DOM
- Keyboard event handling for input
- Responsive viewport sizing based on window dimensions

### Key Patterns
- All imports use `.js` extensions (ESM modules)
- Async data loading pattern
- Systems execute order: Input → Movement → RegionDisplay → Viewport → Render
- Player starts at Hobbiton: Position(145, 49), Renderable('@', 10, 'yellowBright')
- Entity lookup uses component type strings: `world.getEntitiesWithComponent('Player')`
- Binary data parsing uses Uint8Array/DataView

### Commands
```bash
npm start              # Start web dev server (localhost:3000)
npm run build          # Build for production
npm run preview        # Preview production build
npm test              # Run tests
npm run preprocess    # Regenerate all map data
```

## Development Notes

### TypeScript Configuration
- Uses `"moduleResolution": "bundler"`
- ESM modules with `.js` extensions in imports (even for .ts files)
- Strict mode enabled

### Dependencies
- **React 19**: UI component model
- **react-dom**: Web rendering
- **Vite**: Web bundler and dev server
- **numpy**: Python dependency for map preprocessing

### Region System
- **RegionData.ts**: Loads preprocessed binary region grid (maps/middle_earth_regions.bin)
- **RegionInfo.ts**: Component tracking current realm/sub-region names
- **RegionDisplaySystem.ts**: Updates region info based on player position
- Python preprocessing script in `scripts/map_preprocessing.py` generates region data
- Binary format REG2: 4-byte header + 3 bytes per tile (realm ID, sub-region ID, geo feature ID) + name tables
- Geographic features (mountains, forests, etc.) take display priority over regions

### Geographic Features
- **geo_features_preprocessing.py**: Module for detecting and labeling geographic features
- Supports embedded labels (e.g., "Mirkwood") and ?-prefixed labels (e.g., "?Dead_Marshes")
- Features can span multiple realms (e.g., Misty Mountains)
- Rivers and roads don't break feature connectivity
- 48 geographic features detected in Middle Earth map

### Build Process
- Vite bundles to dist-web/ (excluded from git)
- **GitHub Actions**: Automatic deployment to GitHub Pages
- Map preprocessing generates binary files:
  - ~300KB region grid (REG2 format)
  - ~100KB mountain depth (MDEP format)
  - ~3KB POI CSV
- Binary files served as static assets

### Testing Considerations
- Web version runs on any modern browser
- tsconfig.web.json (includes DOM types)
- Binary map files must exist (auto-generated on first run)

### Code Style
- No comments unless explicitly requested
- Prefer editing existing files over creating new ones
- Follow existing patterns for components/systems
- Shared interfaces in shared/ folder
- Error messages include file path and line number

## Communication Protocols
- Let the developer know when you want to start the web server (give the command), and specify what it is you want them to look for/test. You DO NOT have the ability to test the web version yourself.
