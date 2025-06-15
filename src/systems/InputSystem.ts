import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';

export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | null;

export class InputSystem extends System {
  private currentDirection: Direction = null;
  private inputHandled = false;

  update(world: World, deltaTime: number): void {
    // Reset direction after it's been handled
    if (this.inputHandled) {
      this.currentDirection = null;
      this.inputHandled = false;
    }
  }

  setDirection(direction: Direction): void {
    this.currentDirection = direction;
    this.inputHandled = false;
  }

  getDirection(): Direction {
    return this.currentDirection;
  }

  consumeDirection(): Direction {
    const direction = this.currentDirection;
    this.inputHandled = true;
    return direction;
  }
}

