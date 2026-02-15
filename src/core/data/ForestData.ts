import type { DataLoader } from '../../shared/DataLoader.js';

export class ForestData {
  private width: number = 0;
  private height: number = 0;
  private depthGrid: Uint8Array | null = null;

  constructor(private loader: DataLoader) {}

  async loadFromFile(depthFile: string): Promise<void> {
    try {
      const buffer = await this.loader.loadBinaryFile(depthFile);
      this.parseBinaryGrid(new Uint8Array(buffer));
    } catch (error) {
      throw new Error(`ForestData.loadFromFile failed: ${error}\n  at src/core/data/ForestData.ts:13`);
    }
  }

  private parseBinaryGrid(buffer: Uint8Array): void {
    try {
      let offset = 0;

      const magic = String.fromCharCode(...buffer.slice(0, 4));
      if (magic !== 'FDEP') {
        throw new Error(`Invalid forest depth file format. Expected 'FDEP', got '${magic}'\n  at src/core/data/ForestData.ts:25`);
      }
    offset += 4;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true);
    offset += 2;
    this.width = view.getUint16(offset, true);
    offset += 2;
    this.height = view.getUint16(offset, true);
    offset += 2;

    if (version !== 1) {
      throw new Error(`Unsupported forest depth version: ${version}\n  at src/core/data/ForestData.ts:38`);
    }

    const gridSize = this.width * this.height;
    this.depthGrid = new Uint8Array(gridSize);

    for (let i = 0; i < gridSize; i++) {
      this.depthGrid[i] = buffer[offset];
      offset += 1;
    }
    } catch (error) {
      throw new Error(`ForestData.parseBinaryGrid failed: ${error}\n  at src/core/data/ForestData.ts:21`);
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

  isDeepForest(x: number, y: number): boolean {
    return this.getDepth(x, y) >= 4;
  }

  isEdgeForest(x: number, y: number): boolean {
    const depth = this.getDepth(x, y);
    return depth > 0 && depth < 4;
  }
}
