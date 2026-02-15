import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { Renderable } from '../components/Renderable.js';
import { LocalViewportSystem } from './LocalViewportSystem.js';
import type { StyledTile } from '../../shared/StyledTile.js';
import type { TerrainStyle } from './TerrainColors.js';

const LOCAL_TERRAIN_STYLES: Record<string, TerrainStyle> = {
  'T': { color: 'green' },
  '.': { color: 'gray' },
  '&': { color: 'green', dim: true },
  '"': { color: 'yellow' },
  '#': { color: 'gray', bold: true },
  '=': { color: 'blueBright' },
  '~': { color: 'yellow' },
  '%': { color: 'green', dim: true },
  '^': { color: 'red' },
  ' ': {},
};

function getLocalTerrainStyle(char: string): TerrainStyle {
  return LOCAL_TERRAIN_STYLES[char] || { color: 'white' };
}

export class LocalRenderSystem extends System {
  private styledMap: StyledTile[][] = [];

  constructor(private localViewportSystem: LocalViewportSystem) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const viewport = this.localViewportSystem.getViewport();
    const viewSize = this.localViewportSystem.getViewportSize();

    this.styledMap = viewport.map(row =>
      row.map(char => ({
        char,
        style: getLocalTerrainStyle(char),
      }))
    );

    const halfW = Math.floor(viewSize.width / 2);
    const halfH = Math.floor(viewSize.height / 2);

    const players = world.getEntitiesWithComponent('LocalPosition');
    if (players.length > 0) {
      const renderable = players[0].getComponent<Renderable>('Renderable');
      if (renderable) {
        this.styledMap[halfH][halfW] = {
          char: renderable.char,
          style: {
            color: renderable.color,
            backgroundColor: renderable.backgroundColor,
            bold: renderable.bold,
            dim: renderable.dim,
          },
        };
      }
    }
  }

  getStyledMap(): StyledTile[][] {
    return this.styledMap;
  }
}
