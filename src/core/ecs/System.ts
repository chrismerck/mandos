import { World } from './World.js';

export abstract class System {
  abstract update(world: World, deltaTime: number): void;
}