import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DataLoader } from '../shared/DataLoader.js';

export class NodeDataLoader implements DataLoader {
  private basePath: string;

  constructor(basePath: string = 'maps') {
    this.basePath = basePath;
  }

  async loadTextFile(filename: string): Promise<string> {
    const filePath = path.join(process.cwd(), this.basePath, filename);
    return fs.promises.readFile(filePath, 'utf-8');
  }

  async loadBinaryFile(filename: string): Promise<ArrayBuffer> {
    const filePath = path.join(process.cwd(), this.basePath, filename);
    const buffer = await fs.promises.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
}