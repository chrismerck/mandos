import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { LocalPosition } from '../components/LocalPosition.js';
import { InputSystem } from './InputSystem.js';
import { LocalMapCache } from '../local/LocalMapCache.js';
import { LocalMapGenerator } from '../local/LocalMapGenerator.js';

const TILE_SIZE = 43;

export class LocalMovementSystem extends System {
  constructor(
    private inputSystem: InputSystem,
    private cache: LocalMapCache,
    private generator: LocalMapGenerator
  ) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const direction = this.inputSystem.consumeDirection();
    if (!direction) return;

    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length === 0) return;

    const lp = players[0].getComponent<LocalPosition>('LocalPosition');
    if (!lp) return;

    let dx = 0, dy = 0;
    if (direction.includes('left'))  dx = -1;
    if (direction.includes('right')) dx = 1;
    if (direction.includes('up'))    dy = -1;
    if (direction.includes('down'))  dy = 1;

    let newLx = lp.lx + dx;
    let newLy = lp.ly + dy;
    let newWx = lp.wx;
    let newWy = lp.wy;

    if (newLx < 0) { newWx--; newLx += TILE_SIZE; }
    if (newLx >= TILE_SIZE) { newWx++; newLx -= TILE_SIZE; }
    if (newLy < 0) { newWy--; newLy += TILE_SIZE; }
    if (newLy >= TILE_SIZE) { newWy++; newLy -= TILE_SIZE; }

    this.ensureGenerated(newWx, newWy);

    const grid = this.cache.get(newWx, newWy);
    if (!grid) return;

    const destTile = grid[newLy][newLx];
    if (destTile === 'T' || destTile === '#' || destTile === '=') return;

    lp.lx = newLx;
    lp.ly = newLy;
    lp.wx = newWx;
    lp.wy = newWy;

    this.ensureNeighborsGenerated(newWx, newWy);
  }

  ensureGenerated(wx: number, wy: number): void {
    if (!this.cache.has(wx, wy)) {
      this.cache.set(wx, wy, this.generator.generateTile(wx, wy));
    }
  }

  ensureNeighborsGenerated(wx: number, wy: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.ensureGenerated(wx + dx, wy + dy);
      }
    }
  }
}
