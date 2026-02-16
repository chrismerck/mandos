import type { DataLoader } from '../../shared/DataLoader.js';

export class RiverFlowData {
  private width: number = 0;
  private height: number = 0;
  private componentGrid: Uint8Array | null = null;
  private flowGrid: Uint16Array | null = null;
  private maxFlows: number[] = [];

  constructor(private loader: DataLoader) {}

  async loadFromFile(filename: string): Promise<void> {
    try {
      const buffer = await this.loader.loadBinaryFile(filename);
      this.parseBinary(new Uint8Array(buffer));
    } catch (error) {
      throw new Error(`RiverFlowData.loadFromFile failed: ${error}\n  at src/core/data/RiverFlowData.ts:14`);
    }
  }

  private parseBinary(buffer: Uint8Array): void {
    let offset = 0;

    const magic = String.fromCharCode(...buffer.slice(0, 4));
    if (magic !== 'RFLW') {
      throw new Error(`Invalid river flow file. Expected 'RFLW', got '${magic}'\n  at src/core/data/RiverFlowData.ts:22`);
    }
    offset += 4;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const version = view.getUint16(offset, true);
    offset += 2;
    if (version !== 1) {
      throw new Error(`Unsupported river flow version: ${version}\n  at src/core/data/RiverFlowData.ts:30`);
    }
    this.width = view.getUint16(offset, true);
    offset += 2;
    this.height = view.getUint16(offset, true);
    offset += 2;

    const gridSize = this.width * this.height;
    this.componentGrid = new Uint8Array(gridSize);
    this.flowGrid = new Uint16Array(gridSize);

    for (let i = 0; i < gridSize; i++) {
      this.componentGrid[i] = buffer[offset];
      offset += 1;
      this.flowGrid[i] = view.getUint16(offset, true);
      offset += 2;
    }

    const componentCount = buffer[offset];
    offset += 1;
    this.maxFlows = [];
    for (let i = 0; i < componentCount; i++) {
      this.maxFlows.push(view.getUint16(offset, true));
      offset += 2;
    }
  }

  isRiver(x: number, y: number): boolean {
    if (!this.componentGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.componentGrid[y * this.width + x] !== 0;
  }

  getFlow(x: number, y: number): { componentId: number; flow: number; maxFlow: number } | null {
    if (!this.componentGrid || !this.flowGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const idx = y * this.width + x;
    const cid = this.componentGrid[idx];
    if (cid === 0) return null;
    return {
      componentId: cid,
      flow: this.flowGrid[idx],
      maxFlow: this.maxFlows[cid - 1] || 1,
    };
  }
}
