import { createNoise2D } from 'simplex-noise';
import { MapData } from '../data/MapData.js';
import { ForestData } from '../data/ForestData.js';
import { getDensityForDepth, type DensityEntry } from './ForestDensityConfig.js';

const TILE_SIZE = 43;
const BORDER = 4;
const WORK_SIZE = TILE_SIZE + BORDER * 2;

function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class LocalMapGenerator {
  private noise1: (x: number, y: number) => number;
  private noise2: (x: number, y: number) => number;
  private noise3: (x: number, y: number) => number;

  constructor(
    private mapData: MapData,
    private forestData: ForestData,
    seed: number
  ) {
    this.noise1 = createNoise2D(mulberry32(seed));
    this.noise2 = createNoise2D(mulberry32(seed + 1));
    this.noise3 = createNoise2D(mulberry32(seed + 2));
  }

  generateTile(wx: number, wy: number): string[][] {
    const densityGrid = this.buildDensityGrid(wx, wy);
    const work = this.generateNoiseGrid(wx, wy, densityGrid);
    this.applyCellularAutomata(work);
    return this.trimBorder(work);
  }

  private buildDensityGrid(wx: number, wy: number): DensityEntry[][] {
    const grid: DensityEntry[][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const row: DensityEntry[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        const depth = this.forestData.getDepth(wx + dx, wy + dy);
        row.push(getDensityForDepth(depth));
      }
      grid.push(row);
    }
    return grid;
  }

  private interpolateDensity(
    localX: number,
    localY: number,
    densityGrid: DensityEntry[][]
  ): DensityEntry {
    const fx = (localX + BORDER) / (WORK_SIZE - 1);
    const fy = (localY + BORDER) / (WORK_SIZE - 1);

    const gx = fx * 2;
    const gy = fy * 2;

    const ix = Math.min(Math.floor(gx), 1);
    const iy = Math.min(Math.floor(gy), 1);

    const tx = gx - ix;
    const ty = gy - iy;

    const d00 = densityGrid[iy][ix];
    const d10 = densityGrid[iy][ix + 1];
    const d01 = densityGrid[iy + 1][ix];
    const d11 = densityGrid[iy + 1][ix + 1];

    return {
      treeDensity:
        d00.treeDensity * (1 - tx) * (1 - ty) +
        d10.treeDensity * tx * (1 - ty) +
        d01.treeDensity * (1 - tx) * ty +
        d11.treeDensity * tx * ty,
      brambleMargin:
        d00.brambleMargin * (1 - tx) * (1 - ty) +
        d10.brambleMargin * tx * (1 - ty) +
        d01.brambleMargin * (1 - tx) * ty +
        d11.brambleMargin * tx * ty,
      herbMargin:
        d00.herbMargin * (1 - tx) * (1 - ty) +
        d10.herbMargin * tx * (1 - ty) +
        d01.herbMargin * (1 - tx) * ty +
        d11.herbMargin * tx * ty,
    };
  }

  private sampleNoise(gx: number, gy: number): number {
    const n1 = this.noise1(gx / 20, gy / 20) * 1.0;
    const n2 = this.noise2(gx / 10, gy / 10) * 0.5;
    const n3 = this.noise3(gx / 5, gy / 5) * 0.25;
    const raw = n1 + n2 + n3;
    return (raw + 1.75) / 3.5;
  }

  private generateNoiseGrid(
    wx: number,
    wy: number,
    densityGrid: DensityEntry[][]
  ): string[][] {
    const grid: string[][] = [];

    for (let y = 0; y < WORK_SIZE; y++) {
      const row: string[] = [];
      for (let x = 0; x < WORK_SIZE; x++) {
        const localX = x - BORDER;
        const localY = y - BORDER;
        const gx = wx * TILE_SIZE + localX;
        const gy = wy * TILE_SIZE + localY;

        const n = this.sampleNoise(gx, gy);
        const density = this.interpolateDensity(localX, localY, densityGrid);

        let cell: string;
        if (n < density.treeDensity) {
          cell = 'T';
        } else if (n < density.treeDensity + density.brambleMargin) {
          cell = '&';
        } else if (n < density.treeDensity + density.brambleMargin + density.herbMargin) {
          cell = '"';
        } else {
          cell = '.';
        }
        row.push(cell);
      }
      grid.push(row);
    }

    return grid;
  }

  private applyCellularAutomata(grid: string[][]): void {
    for (let pass = 0; pass < 2; pass++) {
      const snapshot = grid.map(row => [...row]);

      for (let y = 1; y < WORK_SIZE - 1; y++) {
        for (let x = 1; x < WORK_SIZE - 1; x++) {
          let treeNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (snapshot[y + dy][x + dx] === 'T') treeNeighbors++;
            }
          }

          if (snapshot[y][x] === 'T' && treeNeighbors < 2) {
            grid[y][x] = '&';
          } else if (snapshot[y][x] !== 'T' && treeNeighbors >= 5) {
            grid[y][x] = 'T';
          }
        }
      }
    }
  }

  private trimBorder(work: string[][]): string[][] {
    const result: string[][] = [];
    for (let y = BORDER; y < BORDER + TILE_SIZE; y++) {
      result.push(work[y].slice(BORDER, BORDER + TILE_SIZE));
    }
    return result;
  }
}
