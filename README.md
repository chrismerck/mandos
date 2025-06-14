# Mandos2 - Middle Earth Terminal Map Game

An ADOM-inspired terminal-based map exploration game built with TypeScript, React Ink, and an Entity Component System (ECS) architecture.

## Completed Features

### Phase 1 ✓
Basic viewport rendering of Middle Earth map:
- ECS framework (Entity, Component, System, World)
- Map data loader for ASCII worldmap
- Viewport system (80x20 view)
- Render system
- React Ink terminal UI

### Phase 2 ✓
Player navigation:
- Player entity with @ symbol
- Movement with arrow keys and vi-keys (hjkl)
- Collision detection (can't walk on water ~ or mountains ^)
- Viewport follows player
- Real-time input handling
- Comprehensive unit tests

## Running the Game

```bash
npm install
npm start
```

### Controls
- **Arrow keys** or **h,j,k,l** - Move player
- **Ctrl+C** - Exit game

## Testing

```bash
npm test          # Run all tests
npm test:watch    # Run tests in watch mode
```

## Architecture

- **Entity Component System (ECS)**: Core game architecture
  - Entities: Player, Locations (future)
  - Components: Position, Renderable, Movable, Player
  - Systems: ViewportSystem, RenderSystem, InputSystem, MovementSystem
- **TypeScript**: Type-safe development with ESM modules
- **React Ink**: Terminal UI with hooks
- **Jest**: Unit testing with ts-jest

## Map Legend
- `@` - Player (you)
- `~` - Water (impassable)
- `^` - Mountains (impassable)
- `&` - Forest
- `.` - Plains/Roads
- `!` - Named locations (e.g., !Hobbiton)
- `?` - Geographic features

## Next Steps (Phase 3)
- Location discovery system
- Info panel (ADOM-style)
- Discovery messages
- Save/load functionality