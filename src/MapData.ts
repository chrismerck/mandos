import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MapTile {
  char: string;
  x: number;
  y: number;
}

export class MapData {
  private tiles: string[][] = [];
  width: number = 0;
  height: number = 0;

  loadFromFile(filename: string): void {
    const mapPath = path.join(process.cwd(), 'maps', filename);
    const content = fs.readFileSync(mapPath, 'utf-8');
    this.parseMap(content);
  }

  private parseMap(content: string): void {
    const lines = content.split('\n');
    this.tiles = [];
    this.height = 0;
    this.width = 0;

    for (const line of lines) {
      if (line.length > 0) {
        const chars = line.split('');
        this.tiles.push(chars);
        this.width = Math.max(this.width, chars.length);
        this.height++;
      }
    }

    // Pad all rows to same width
    for (let y = 0; y < this.height; y++) {
      while (this.tiles[y].length < this.width) {
        this.tiles[y].push(' ');
      }
    }
  }

  getTile(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return ' ';
    }
    return this.tiles[y][x];
  }

  getViewport(centerX: number, centerY: number, viewWidth: number, viewHeight: number): string[][] {
    const viewport: string[][] = [];
    const halfWidth = Math.floor(viewWidth / 2);
    const halfHeight = Math.floor(viewHeight / 2);

    for (let y = 0; y < viewHeight; y++) {
      const row: string[] = [];
      for (let x = 0; x < viewWidth; x++) {
        const mapX = centerX - halfWidth + x;
        const mapY = centerY - halfHeight + y;
        row.push(this.getTile(mapX, mapY));
      }
      viewport.push(row);
    }

    return viewport;
  }
}