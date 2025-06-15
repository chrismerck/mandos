import { System } from '../ecs/System.js';
import { World } from '../ecs/World.js';
import { Position } from '../components/Position.js';
import { Player } from '../components/Player.js';
import { RegionInfo } from '../components/RegionInfo.js';
import { RegionData } from '../RegionData.js';

export class RegionDisplaySystem extends System {
  constructor(private regionData: RegionData) {
    super();
  }
  
  update(world: World, deltaTime: number): void {
    // Find all player entities
    const players = world.getEntitiesWithComponent('Player');
    
    for (const entity of players) {
      const position = entity.getComponent('Position') as Position;
      const player = entity.getComponent('Player') as Player;
      
      if (position && player) {
        // Get or create RegionInfo component
        let regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
        if (!regionInfo) {
          regionInfo = new RegionInfo();
          entity.addComponent(regionInfo);
        }
        
        // Look up current region
        const region = this.regionData.getRegionInfo(position.x, position.y);
        
        if (region) {
          // Show both realm and geographic feature when in a geographic feature
          if (region.geoFeatureName) {
            // Show realm name and geographic feature name
            if (regionInfo.realmName !== region.realmName || 
                regionInfo.subRegionName !== region.geoFeatureName) {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.geoFeatureName;
            }
          } else {
            // Show realm/region names
            if (regionInfo.realmName !== region.realmName || 
                regionInfo.subRegionName !== region.subRegionName) {
              regionInfo.realmName = region.realmName;
              regionInfo.subRegionName = region.subRegionName;
            }
          }
        } else {
          // Outside any region
          if (regionInfo.realmName !== 'The Wilds' || regionInfo.subRegionName !== '') {
            regionInfo.realmName = 'The Wilds';
            regionInfo.subRegionName = '';
          }
        }
      }
    }
  }
  
  getPlayerRegionInfo(world: World): { realm: string; subRegion: string } | null {
    const players = world.getEntitiesWithComponent('Player');
    
    for (const entity of players) {
      const regionInfo = entity.getComponent('RegionInfo') as RegionInfo;
      if (regionInfo) {
        return {
          realm: regionInfo.realmName,
          subRegion: regionInfo.subRegionName
        };
      }
    }
    
    return null;
  }
}