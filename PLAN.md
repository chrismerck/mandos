# ADOM-Inspired Terminal Map Game with ECS (TypeScript + React Ink)

## Core Architecture: Entity Component System (ECS)
- **Entities**: Player, Locations, Terrain features
- **Components**: Position, Renderable, Movable, Discoverable, Terrain
- **Systems**: RenderSystem, MovementSystem, InputSystem, ViewportSystem

## Incremental Development Plan

### Phase 1: Basic Viewport ✓ MVP
1. **Setup**
   - Initialize TypeScript project with React Ink
   - Configure tsconfig.json, jest for testing
   - Basic ECS framework setup

2. **Core Files**
   ```
   /src
     /ecs
       - Entity.ts
       - Component.ts
       - System.ts
       - World.ts
     /components
       - Position.ts
       - Renderable.ts
     /systems
       - ViewportSystem.ts
       - RenderSystem.ts
     - MapData.ts (parse worldmap)
     - index.tsx
   ```

3. **Tests**: ViewportSystem centering, map bounds, render output

### Phase 2: Player Navigation
1. Add player entity with Position component
2. Implement InputSystem (vi-keys: hjkl, arrows)
3. Add MovementSystem with collision detection
4. Tests: movement bounds, collision, input handling

### Phase 3: Location Discovery
1. Add Discoverable component for POIs
2. Implement DiscoverySystem
3. Add info panel (ADOM-style)
4. Tests: discovery triggers, info display

### Phase 4: Polish
1. Colors (blessed-style)
2. Status line (position, location)
3. Message log
4. Save/load position

## Initial Implementation (Phase 1 Only)
```typescript
// Minimal ECS setup
interface Component {}
interface Entity { id: string; components: Map<string, Component> }
interface System { update(world: World): void }

// Just show a 40x20 viewport of the map
// No player, no movement, just rendering
```

## Testing Strategy
- Unit tests for each system
- Integration tests for ECS interactions
- Manual testing checklist for each phase

## ADOM Inspirations
- Look command (l) to examine
- Message log at top
- Status line at bottom
- Discovery messages ("You have discovered Rivendell!")
- Clean ASCII aesthetic