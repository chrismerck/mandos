import { MovementSystem } from '../MovementSystem.js';
import { InputSystem } from '../InputSystem.js';
import { World } from '../../ecs/World.js';
import { MapData } from '../../MapData.js';
import { Position } from '../../components/Position.js';
import { Movable } from '../../components/Movable.js';
import { Player } from '../../components/Player.js';

// Mock MapData
class MockMapData extends MapData {
  constructor(private mockWidth: number, private mockHeight: number) {
    super();
    this.width = mockWidth;
    this.height = mockHeight;
  }

  getTile(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return ' ';
    }
    // Create a simple test map
    // Water on edges
    if (x === 0 || x === this.width - 1) return '~';
    if (y === 0 || y === this.height - 1) return '~';
    // Mountain at (5, 5)
    if (x === 5 && y === 5) return '^';
    // Clear everywhere else
    return '.';
  }
}

describe('MovementSystem', () => {
  let world: World;
  let inputSystem: InputSystem;
  let mapData: MockMapData;
  let movementSystem: MovementSystem;
  let player: ReturnType<World['createEntity']>;

  beforeEach(() => {
    world = new World();
    inputSystem = new InputSystem();
    mapData = new MockMapData(10, 10);
    movementSystem = new MovementSystem(inputSystem, mapData);

    // Create player entity
    player = world.createEntity();
    player.addComponent(new Player());
    player.addComponent(new Position(3, 3));
    player.addComponent(new Movable(1));

    world.addSystem(inputSystem);
    world.addSystem(movementSystem);
  });

  test('should move player on valid input', () => {
    const position = player.getComponent<Position>('Position');
    expect(position?.x).toBe(3);
    expect(position?.y).toBe(3);

    inputSystem.setDirection('right');
    world.update(16);

    expect(position?.x).toBe(4);
    expect(position?.y).toBe(3);
  });

  test('should not move into water', () => {
    player.getComponent<Position>('Position')!.x = 1;
    player.getComponent<Position>('Position')!.y = 3;

    inputSystem.setDirection('left');
    world.update(16);

    const position = player.getComponent<Position>('Position');
    expect(position?.x).toBe(1); // Should not have moved
  });

  test('should not move into mountains', () => {
    player.getComponent<Position>('Position')!.x = 4;
    player.getComponent<Position>('Position')!.y = 5;

    inputSystem.setDirection('right');
    world.update(16);

    const position = player.getComponent<Position>('Position');
    expect(position?.x).toBe(4); // Should not have moved
  });

  test('should not move outside map bounds', () => {
    player.getComponent<Position>('Position')!.x = 8;
    player.getComponent<Position>('Position')!.y = 8;

    // Try to move past the edge
    inputSystem.setDirection('right');
    world.update(16);
    inputSystem.setDirection('right');
    world.update(16);

    const position = player.getComponent<Position>('Position');
    expect(position?.x).toBe(8); // Should stop at edge (water)
  });

  test('should handle all directions', () => {
    const position = player.getComponent<Position>('Position');
    
    // Up
    inputSystem.setDirection('up');
    world.update(16);
    expect(position?.y).toBe(2);

    // Down
    inputSystem.setDirection('down');
    world.update(16);
    expect(position?.y).toBe(3);

    // Left
    inputSystem.setDirection('left');
    world.update(16);
    expect(position?.x).toBe(2);

    // Right
    inputSystem.setDirection('right');
    world.update(16);
    expect(position?.x).toBe(3);
  });

  test('should handle diagonal movement', () => {
    const position = player.getComponent<Position>('Position');
    
    // Up-left
    inputSystem.setDirection('up-left');
    world.update(16);
    expect(position?.x).toBe(2);
    expect(position?.y).toBe(2);

    // Down-right (should go back to 3,3)
    inputSystem.setDirection('down-right');
    world.update(16);
    expect(position?.x).toBe(3);
    expect(position?.y).toBe(3);

    // Up-right
    inputSystem.setDirection('up-right');
    world.update(16);
    expect(position?.x).toBe(4);
    expect(position?.y).toBe(2);

    // Down-left (should go back to 3,3)
    inputSystem.setDirection('down-left');
    world.update(16);
    expect(position?.x).toBe(3);
    expect(position?.y).toBe(3);
  });
});