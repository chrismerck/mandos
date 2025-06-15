import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { Position } from '../components/Position.js';
import { Movable } from '../components/Movable.js';
import { Player } from '../components/Player.js';
import { InputSystem } from './InputSystem.js';
import { MapData } from '../MapData.js';

export class MovementSystem extends System {
  constructor(
    private inputSystem: InputSystem,
    private mapData: MapData
  ) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const direction = this.inputSystem.consumeDirection();
    if (!direction) return;

    // Find the player entity
    const playerEntities = world.getEntitiesWithComponent('Player');
    if (playerEntities.length === 0) return;

    const player = playerEntities[0];
    const position = player.getComponent<Position>('Position');
    const movable = player.getComponent<Movable>('Movable');

    if (!position || !movable) return;

    // Calculate new position
    let newX = position.x;
    let newY = position.y;

    switch (direction) {
      case 'up':
        newY -= movable.speed;
        break;
      case 'down':
        newY += movable.speed;
        break;
      case 'left':
        newX -= movable.speed;
        break;
      case 'right':
        newX += movable.speed;
        break;
      case 'up-left':
        newX -= movable.speed;
        newY -= movable.speed;
        break;
      case 'up-right':
        newX += movable.speed;
        newY -= movable.speed;
        break;
      case 'down-left':
        newX -= movable.speed;
        newY += movable.speed;
        break;
      case 'down-right':
        newX += movable.speed;
        newY += movable.speed;
        break;
    }

    // Check if new position is valid
    if (this.isValidPosition(newX, newY)) {
      position.x = newX;
      position.y = newY;
    }
  }

  private isValidPosition(x: number, y: number): boolean {
    // Check map bounds
    if (x < 0 || x >= this.mapData.width || y < 0 || y >= this.mapData.height) {
      return false;
    }

    // Check terrain (can't walk on water or mountains)
    const tile = this.mapData.getTile(x, y);
    const impassableTerrain = ['~', '^', '='];
    
    return !impassableTerrain.includes(tile);
  }
}