import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { MapData } from '../data/MapData.js';
import { Position } from '../components/Position.js';
import { Player } from '../components/Player.js';

export class ViewportSystem extends System {
  private viewport: string[][] = [];
  
  constructor(
    private mapData: MapData,
    private viewWidth: number = 80,
    private viewHeight: number = 20,
    private centerX: number = 0,
    private centerY: number = 0
  ) {
    super();
  }
  
  setViewportSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }
  
  getViewportSize(): { width: number; height: number } {
    return { width: this.viewWidth, height: this.viewHeight };
  }

  update(world: World, deltaTime: number): void {
    // Follow the player if one exists
    const playerEntities = world.getEntitiesWithComponent('Player');
    if (playerEntities.length > 0) {
      const player = playerEntities[0];
      const position = player.getComponent<Position>('Position');
      if (position) {
        this.centerX = position.x;
        this.centerY = position.y;
      }
    }

    this.viewport = this.mapData.getViewport(
      this.centerX,
      this.centerY,
      this.viewWidth,
      this.viewHeight
    );
  }

  getViewport(): string[][] {
    return this.viewport;
  }

  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  getCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY };
  }
}