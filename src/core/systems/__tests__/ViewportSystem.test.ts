import { ViewportSystem } from '../ViewportSystem';
import { World } from '../../ecs/World';
import { MapData } from '../../MapData';

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
    return '.';
  }
}

describe('ViewportSystem', () => {
  let world: World;
  let mapData: MockMapData;
  let viewportSystem: ViewportSystem;

  beforeEach(() => {
    world = new World();
    mapData = new MockMapData(100, 100);
    viewportSystem = new ViewportSystem(mapData, 10, 10);
  });

  test('should create viewport centered at origin', () => {
    viewportSystem.update(world, 0);
    const viewport = viewportSystem.getViewport();
    
    expect(viewport).toHaveLength(10);
    expect(viewport[0]).toHaveLength(10);
  });

  test('should handle viewport at map edges', () => {
    viewportSystem.setCenter(0, 0);
    viewportSystem.update(world, 0);
    const viewport = viewportSystem.getViewport();
    
    // Top-left corner should have some empty spaces
    expect(viewport[0][0]).toBe(' ');
    expect(viewport[5][5]).toBe('.');
  });

  test('should update center position', () => {
    viewportSystem.setCenter(50, 50);
    const center = viewportSystem.getCenter();
    
    expect(center.x).toBe(50);
    expect(center.y).toBe(50);
  });
});