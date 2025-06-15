import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { ViewportSystem } from './ViewportSystem.js';
import { Position } from '../components/Position.js';
import { Renderable } from '../components/Renderable.js';
import { getTerrainStyle, TerrainStyle } from './TerrainColors.js';
import { StyledTile } from '../components/MapDisplay.js';

export class RenderSystem extends System {
  private renderedMap: string[][] = [];
  private styledMap: StyledTile[][] = [];

  constructor(private viewportSystem: ViewportSystem) {
    super();
  }

  update(world: World, deltaTime: number): void {
    // Get the base viewport from the map
    this.renderedMap = this.viewportSystem.getViewport().map(row => [...row]);
    
    // Create styled map from terrain
    this.styledMap = this.renderedMap.map(row => 
      row.map(char => ({
        char,
        style: getTerrainStyle(char)
      }))
    );
    
    // Overlay entities with Position and Renderable components
    const renderableEntities = world.getEntitiesWithComponent('Renderable');
    const viewportCenter = this.viewportSystem.getCenter();
    const viewWidth = this.renderedMap[0]?.length || 0;
    const viewHeight = this.renderedMap.length;
    const halfWidth = Math.floor(viewWidth / 2);
    const halfHeight = Math.floor(viewHeight / 2);

    for (const entity of renderableEntities) {
      const position = entity.getComponent<Position>('Position');
      const renderable = entity.getComponent<Renderable>('Renderable');

      if (position && renderable) {
        // Convert world position to viewport position
        const viewX = position.x - viewportCenter.x + halfWidth;
        const viewY = position.y - viewportCenter.y + halfHeight;

        // Check if entity is within viewport bounds
        if (viewX >= 0 && viewX < viewWidth && viewY >= 0 && viewY < viewHeight) {
          this.renderedMap[viewY][viewX] = renderable.char;
          this.styledMap[viewY][viewX] = {
            char: renderable.char,
            style: {
              color: renderable.color,
              backgroundColor: renderable.backgroundColor,
              bold: renderable.bold,
              dim: renderable.dim
            }
          };
        }
      }
    }
  }

  getRenderedMap(): string[][] {
    return this.renderedMap;
  }

  getStyledMap(): StyledTile[][] {
    return this.styledMap;
  }

  getRenderedString(): string {
    return this.renderedMap.map(row => row.join('')).join('\n');
  }
}