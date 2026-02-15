import type { DataLoader } from '../../shared/DataLoader.js';

export class PoiRiverData {
  private width: number = 0;
  private height: number = 0;
  private poiGrid: Uint8Array | null = null;
  private poiNames: string[] = [];

  constructor(private loader: DataLoader) {}

  async loadFromFile(filename: string): Promise<void> {
    const buffer = await this.loader.loadBinaryFile(filename);
    this.parseBinary(new Uint8Array(buffer));
  }

  private parseBinary(buffer: Uint8Array): void {
    let offset = 0;

    const magic = String.fromCharCode(...buffer.slice(0, 4));
    if (magic !== 'POI1') {
      throw new Error(`Invalid POI file format. Expected 'POI1', got '${magic}'`);
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
      throw new Error(`Unsupported POI version: ${version}`);
    }

    const gridSize = this.width * this.height;
    this.poiGrid = buffer.slice(offset, offset + gridSize);
    offset += gridSize;

    const numNames = buffer[offset];
    offset += 1;
    this.poiNames = [];
    for (let i = 0; i < numNames; i++) {
      const nameLen = buffer[offset];
      offset += 1;
      const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
      offset += nameLen;
      this.poiNames.push(name);
    }
  }

  getPoiName(x: number, y: number): string | null {
    if (!this.poiGrid || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const id = this.poiGrid[y * this.width + x];
    if (id === 255) {
      return null;
    }
    return this.poiNames[id] || null;
  }

  static formatName(raw: string): string {
    let name = raw.replace(/_/g, ' ');
    if (name.startsWith('R ')) {
      name = 'R. ' + name.slice(2);
    }
    return name;
  }
}
