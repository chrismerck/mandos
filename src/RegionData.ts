import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RegionInfo {
  realmId: number;
  realmName: string;
  subRegionId: number;
  subRegionName: string;
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
  private realmNames: string[] = [];
  private subRegionNames: string[] = [];
  private pois: POI[] = [];
  
  loadFromFile(gridFile: string, poiFile: string): void {
    // Load binary grid file
    const gridPath = path.join(process.cwd(), 'maps', gridFile);
    const buffer = fs.readFileSync(gridPath);
    this.parseBinaryGrid(buffer);
    
    // Load POI CSV
    const poiPath = path.join(process.cwd(), 'maps', poiFile);
    const poiContent = fs.readFileSync(poiPath, 'utf-8');
    this.parsePOIs(poiContent);
  }
  
  private parseBinaryGrid(buffer: Buffer): void {
    let offset = 0;
    
    // Check magic number
    const magic = buffer.toString('ascii', 0, 4);
    if (magic !== 'REG1') {
      throw new Error('Invalid region grid file format');
    }
    offset += 4;
    
    // Read header
    const version = buffer.readUInt16LE(offset);
    offset += 2;
    this.width = buffer.readUInt16LE(offset);
    offset += 2;
    this.height = buffer.readUInt16LE(offset);
    offset += 2;
    
    if (version !== 1) {
      throw new Error(`Unsupported region grid version: ${version}`);
    }
    
    // Read grid data
    const gridSize = this.width * this.height;
    this.realmGrid = new Uint8Array(gridSize);
    this.subRegionGrid = new Uint8Array(gridSize);
    
    for (let i = 0; i < gridSize; i++) {
      this.realmGrid[i] = buffer.readUInt8(offset);
      offset += 1;
      this.subRegionGrid[i] = buffer.readUInt8(offset);
      offset += 1;
    }
    
    // Read realm names
    const numRealms = buffer.readUInt8(offset);
    offset += 1;
    this.realmNames = [];
    for (let i = 0; i < numRealms; i++) {
      const nameLen = buffer.readUInt8(offset);
      offset += 1;
      const name = buffer.toString('utf-8', offset, offset + nameLen);
      offset += nameLen;
      this.realmNames.push(name);
    }
    
    // Read sub-region names
    const numSubRegions = buffer.readUInt8(offset);
    offset += 1;
    this.subRegionNames = [];
    for (let i = 0; i < numSubRegions; i++) {
      const nameLen = buffer.readUInt8(offset);
      offset += 1;
      const name = buffer.toString('utf-8', offset, offset + nameLen);
      offset += nameLen;
      this.subRegionNames.push(name);
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
    if (!this.realmGrid || !this.subRegionGrid) {
      return null;
    }
    
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    
    const index = y * this.width + x;
    const realmId = this.realmGrid[index];
    const subRegionId = this.subRegionGrid[index];
    
    if (realmId === 255) {
      return null; // No realm
    }
    
    return {
      realmId,
      realmName: this.realmNames[realmId] || 'Unknown',
      subRegionId: subRegionId === 255 ? -1 : subRegionId,
      subRegionName: subRegionId === 255 ? '' : (this.subRegionNames[subRegionId] || '')
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