import type { DataLoader } from '../../shared/DataLoader.js';

export interface RegionInfo {
  realmId: number;
  realmName: string;
  subRegionId: number;
  subRegionName: string;
  geoFeatureId: number;
  geoFeatureName: string;
}

export interface POI {
  name: string;
  row: number;
  col: number;
  realmId: number;
  subId: number;
  type: string;
}

export class RegionData {
  private width: number = 0;
  private height: number = 0;
  private realmGrid: Uint8Array | null = null;
  private subRegionGrid: Uint8Array | null = null;
  private geoFeatureGrid: Uint8Array | null = null;
  private realmNames: string[] = [];
  private subRegionNames: string[] = [];
  private geoFeatureNames: string[] = [];
  private pois: POI[] = [];
  
  constructor(private loader: DataLoader) {}
  
  async loadFromFile(gridFile: string, poiFile: string): Promise<void> {
    try {
      // Load binary grid file
      const buffer = await this.loader.loadBinaryFile(gridFile);
      this.parseBinaryGrid(new Uint8Array(buffer));
      
      // Load POI CSV
      const poiContent = await this.loader.loadTextFile(poiFile);
      this.parsePOIs(poiContent);
    } catch (error) {
      throw new Error(`RegionData.loadFromFile failed: ${error}\n  at src/core/data/RegionData.ts:34`);
    }
  }
  
  private parseBinaryGrid(buffer: Uint8Array): void {
    try {
      let offset = 0;
      
      // Check magic number
      const magic = String.fromCharCode(...buffer.slice(0, 4));
      if (magic !== 'REG2' && magic !== 'REG1') {
        throw new Error(`Invalid region grid file format. Expected 'REG1' or 'REG2', got '${magic}'\n  at src/core/data/RegionData.ts:50`);
      }
    offset += 4;
    
    // Read header
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true);
    offset += 2;
    this.width = view.getUint16(offset, true);
    offset += 2;
    this.height = view.getUint16(offset, true);
    offset += 2;
    
    if (version !== 1 && version !== 2) {
      throw new Error(`Unsupported region grid version: ${version}\n  at src/core/data/RegionData.ts:63`);
    }
    
    // Read grid data
    const gridSize = this.width * this.height;
    this.realmGrid = new Uint8Array(gridSize);
    this.subRegionGrid = new Uint8Array(gridSize);
    this.geoFeatureGrid = new Uint8Array(gridSize);
    
    if (version === 2) {
      // REG2 format: realm, sub-region, geo-feature per tile
      for (let i = 0; i < gridSize; i++) {
        this.realmGrid[i] = buffer[offset];
        offset += 1;
        this.subRegionGrid[i] = buffer[offset];
        offset += 1;
        this.geoFeatureGrid[i] = buffer[offset];
        offset += 1;
      }
    } else {
      // REG1 format: only realm and sub-region
      for (let i = 0; i < gridSize; i++) {
        this.realmGrid[i] = buffer[offset];
        offset += 1;
        this.subRegionGrid[i] = buffer[offset];
        offset += 1;
        this.geoFeatureGrid[i] = 255; // No geo features
      }
    }
    
    // Read realm names
    const numRealms = buffer[offset];
    offset += 1;
    this.realmNames = [];
    for (let i = 0; i < numRealms; i++) {
      const nameLen = buffer[offset];
      offset += 1;
      const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
      offset += nameLen;
      this.realmNames.push(name);
    }
    
    // Read sub-region names
    const numSubRegions = buffer[offset];
    offset += 1;
    this.subRegionNames = [];
    for (let i = 0; i < numSubRegions; i++) {
      const nameLen = buffer[offset];
      offset += 1;
      const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
      offset += nameLen;
      this.subRegionNames.push(name);
    }
    
    // Read geo feature names (REG2 only)
    if (version === 2 && offset < buffer.length) {
      const numGeoFeatures = buffer[offset];
      offset += 1;
      this.geoFeatureNames = [];
      for (let i = 0; i < numGeoFeatures; i++) {
        const nameLen = buffer[offset];
        offset += 1;
        const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
        offset += nameLen;
        this.geoFeatureNames.push(name);
      }
    }
    } catch (error) {
      throw new Error(`RegionData.parseBinaryGrid failed: ${error}\n  at src/core/data/RegionData.ts:44`);
    }
  }
  
  private parsePOIs(content: string): void {
    const lines = content.split('\n');
    this.pois = [];
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const [name, row, col, realmId, subId, type] = line.split(',');
        this.pois.push({
          name,
          row: parseInt(row),
          col: parseInt(col),
          realmId: parseInt(realmId),
          subId: parseInt(subId),
          type
        });
      }
    }
  }
  
  getRegionInfo(x: number, y: number): RegionInfo | null {
    if (!this.realmGrid || !this.subRegionGrid || !this.geoFeatureGrid) {
      return null;
    }
    
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    
    const index = y * this.width + x;
    const realmId = this.realmGrid[index];
    const subRegionId = this.subRegionGrid[index];
    const geoFeatureId = this.geoFeatureGrid[index];
    
    if (realmId === 255) {
      return null; // No realm
    }
    
    return {
      realmId,
      realmName: this.realmNames[realmId] || 'Unknown',
      subRegionId: subRegionId === 255 ? -1 : subRegionId,
      subRegionName: subRegionId === 255 ? '' : (this.subRegionNames[subRegionId] || ''),
      geoFeatureId: geoFeatureId === 255 ? -1 : geoFeatureId,
      geoFeatureName: geoFeatureId === 255 ? '' : (this.geoFeatureNames[geoFeatureId] || '')
    };
  }
  
  getPOIs(): POI[] {
    return this.pois;
  }
  
  getNearbyPOIs(x: number, y: number, radius: number): POI[] {
    return this.pois.filter(poi => {
      const dx = poi.col - x;
      const dy = poi.row - y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }
}