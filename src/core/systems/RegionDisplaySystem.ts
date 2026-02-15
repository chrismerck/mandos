import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { Position } from '../components/Position.js';
import { Player } from '../components/Player.js';
import { RegionInfo } from '../components/RegionInfo.js';
import { RegionData } from '../data/RegionData.js';
import { PoiRiverData } from '../data/PoiRiverData.js';

export class RegionDisplaySystem extends System {
  constructor(private regionData: RegionData, private poiRiverData?: PoiRiverData) {
    super();
  }

  update(world: World, deltaTime: number): void {
    const players = world.getEntitiesWithComponent('Player');

    for (const entity of players) {
      const position = entity.getComponent('Position') as Position;
      const player = entity.getComponent('Player') as Player;

      if (position && player) {
        let regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
        if (!regionInfo) {
          regionInfo = new RegionInfo();
          entity.addComponent(regionInfo);
        }

        const rawPoiName = this.poiRiverData?.getPoiName(position.x, position.y) ?? null;
        const poiName = rawPoiName ? PoiRiverData.formatName(rawPoiName) : '';

        if (poiName) {
          regionInfo.realmName = '';
          regionInfo.subRegionName = '';
          regionInfo.poiName = poiName;
        } else {
          regionInfo.poiName = '';
          const region = this.regionData.getRegionInfo(position.x, position.y);

          if (region) {
            if (region.geoFeatureName) {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.geoFeatureName;
            } else {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.subRegionName;
            }
          } else {
            regionInfo.realmName = 'The Wilds';
            regionInfo.subRegionName = '';
          }
        }
      }
    }
  }

  getPlayerRegionInfo(world: World): { realm: string; subRegion: string; poiName: string } | null {
    const players = world.getEntitiesWithComponent('Player');

    for (const entity of players) {
      const regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
      if (regionInfo) {
        return {
          realm: regionInfo.realmName,
          subRegion: regionInfo.subRegionName,
          poiName: regionInfo.poiName
        };
      }
    }

    return null;
  }
}
