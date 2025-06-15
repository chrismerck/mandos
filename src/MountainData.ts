import * as fs from 'node:fs';
import * as path from 'node:path';

export class MountainData {
  private width: number = 0;
  private height: number = 0;
  private depthGrid: Uint8Array | null = null;
  
  loadFromFile(depthFile: string): void {
    const depthPath = path.join(process.cwd(), 'maps', depthFile);
    const buffer = fs.readFileSync(depthPath);
    this.parseBinaryGrid(buffer);
  }
  
  private parseBinaryGrid(buffer: Buffer): void {
    let offset = 0;
    
    // Check magic number
    const magic = buffer.toString('ascii', 0, 4);
    if (magic !== 'MDEP') {
      throw new Error('Invalid mountain depth file format');
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
      throw new Error(`Unsupported mountain depth version: ${version}`);
    }
    
    // Read depth data
    const gridSize = this.width * this.height;
    this.depthGrid = new Uint8Array(gridSize);
    
    for (let i = 0; i < gridSize; i++) {
      this.depthGrid[i] = buffer.readUInt8(offset);
      offset += 1;
    }
  }
  
  getDepth(x: number, y: number): number {
    if (!this.depthGrid) {
      return 0;
    }
    
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return 0;
    }
    
    const index = y * this.width + x;
    return this.depthGrid[index];
  }
  
  isDeepMountain(x: number, y: number): boolean {
    return this.getDepth(x, y) >= 4;
  }
  
  isEdgeMountain(x: number, y: number): boolean {
    const depth = this.getDepth(x, y);
    return depth > 0 && depth < 4;
  }
}