import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { LocalPosition } from '../components/LocalPosition.js';
import { LocalMapCache } from '../local/LocalMapCache.js';

const TILE_SIZE = 43;
const VIEWPORT_SIZE = 51;

export class LocalViewportSystem extends System {
  private viewport: string[][] = [];

  constructor(private cache: LocalMapCache) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length === 0) return;

    const lp = players[0].getComponent<LocalPosition>('LocalPosition');
    if (!lp) return;

    const halfView = Math.floor(VIEWPORT_SIZE / 2);
    this.viewport = [];

    for (let vy = 0; vy < VIEWPORT_SIZE; vy++) {
      const row: string[] = [];
      for (let vx = 0; vx < VIEWPORT_SIZE; vx++) {
        const glx = lp.wx * TILE_SIZE + lp.lx - halfView + vx;
        const gly = lp.wy * TILE_SIZE + lp.ly - halfView + vy;

        const twx = Math.floor(glx / TILE_SIZE);
        const tlx = glx - twx * TILE_SIZE;
        const twy = Math.floor(gly / TILE_SIZE);
        const tly = gly - twy * TILE_SIZE;

        const grid = this.cache.get(twx, twy);
        if (grid && tly >= 0 && tly < TILE_SIZE && tlx >= 0 && tlx < TILE_SIZE) {
          row.push(grid[tly][tlx]);
        } else {
          row.push(' ');
        }
      }
      this.viewport.push(row);
    }
  }

  getViewport(): string[][] {
    return this.viewport;
  }

  getViewportSize(): { width: number; height: number } {
    return { width: VIEWPORT_SIZE, height: VIEWPORT_SIZE };
  }
}
