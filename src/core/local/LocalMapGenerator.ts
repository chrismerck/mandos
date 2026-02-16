import { createNoise2D } from 'simplex-noise';
import { MapData } from '../data/MapData.js';
import { ForestData } from '../data/ForestData.js';
import { getDensityForDepth } from './ForestDensityConfig.js';

const TILE_SIZE = 43;
const BORDER = 4;
const WORK_SIZE = TILE_SIZE + BORDER * 2;
const FADE_WIDTH = 8;

function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function edgeFade(x: number, y: number): number {
  const dx = Math.min(x - BORDER, BORDER + TILE_SIZE - 1 - x);
  const dy = Math.min(y - BORDER, BORDER + TILE_SIZE - 1 - y);
  const dist = Math.min(dx, dy);
  if (dist <= 0) return 0;
  if (dist >= FADE_WIDTH) return 1;
  return dist / FADE_WIDTH;
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
    this.applyCellularAutomata(work, 3, mulberry32(wx * 4517 + wy * 7727 + 12345));
    this.applyDiffusion(work, wx, wy);
    this.capDensity(work, 0.85, wx, wy);
    this.carveTrails(work, wx, wy);
    this.applyClumping(work, 2, wx, wy);
    return this.trimBorder(work);
  }

  private buildDensityGrid(wx: number, wy: number): number[][] {
    const grid: number[][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const row: number[] = [];
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
    densityGrid: number[][]
  ): number {
    const u = localX / TILE_SIZE;
    const v = localY / TILE_SIZE;

    let ix: number, tx: number;
    if (u < 0.5) { ix = 0; tx = u + 0.5; }
    else         { ix = 1; tx = u - 0.5; }

    let iy: number, ty: number;
    if (v < 0.5) { iy = 0; ty = v + 0.5; }
    else         { iy = 1; ty = v - 0.5; }

    const d00 = densityGrid[iy][ix];
    const d10 = densityGrid[iy][ix + 1];
    const d01 = densityGrid[iy + 1][ix];
    const d11 = densityGrid[iy + 1][ix + 1];

    return d00 * (1 - tx) * (1 - ty) +
           d10 * tx * (1 - ty) +
           d01 * (1 - tx) * ty +
           d11 * tx * ty;
  }

  private sampleNoise(gx: number, gy: number): number {
    const n1 = this.noise1(gx / 16, gy / 16) * 1.0;
    const n2 = this.noise2(gx / 8, gy / 8) * 0.5;
    const n3 = this.noise3(gx / 4, gy / 4) * 0.25;
    const raw = n1 + n2 + n3;
    return (raw + 1.75) / 3.5;
  }

  private generateNoiseGrid(
    wx: number,
    wy: number,
    densityGrid: number[][]
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

        const clearingWave = this.noise1(gx / 50, gy / 50);
        const clearingEffect = Math.max(0, clearingWave) * density * 0.4;
        const effectiveDensity = density - clearingEffect;

        row.push(n < effectiveDensity ? 'T' : '.');
      }
      grid.push(row);
    }

    return grid;
  }

  private applyCellularAutomata(grid: string[][], passes: number = 3, rng?: () => number): void {
    for (let pass = 0; pass < passes; pass++) {
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
            grid[y][x] = '.';
          } else if (snapshot[y][x] !== 'T' && treeNeighbors >= 4) {
            if (!rng || rng() < 0.65) {
              grid[y][x] = 'T';
            }
          }
        }
      }
    }
  }

  private carveTrails(grid: string[][], wx: number, wy: number): void {
    const rng = mulberry32(wx * 11003 + wy * 6961 + 99991);

    const treeDensity = this.measureDensity(grid);
    if (treeDensity < 0.25) return;

    const numWalkers = Math.floor(treeDensity * 8);
    const walkLength = Math.floor(treeDensity * 80);

    const DIRS: [number, number][] = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];

    for (let w = 0; w < numWalkers; w++) {
      let x = Math.floor(rng() * (WORK_SIZE - 2)) + 1;
      let y = Math.floor(rng() * (WORK_SIZE - 2)) + 1;
      let dirIdx = Math.floor(rng() * 8);

      for (let step = 0; step < walkLength; step++) {
        if (x <= 1 || x >= WORK_SIZE - 2 || y <= 1 || y >= WORK_SIZE - 2) break;

        const fade = edgeFade(x, y);
        if (rng() < fade) {
          grid[y][x] = '.';
        }

        const r = rng();
        if (r < 0.70) {
          // continue straight
        } else if (r < 0.85) {
          dirIdx = (dirIdx + 1) % 8;
        } else {
          dirIdx = (dirIdx + 7) % 8;
        }

        const [dx, dy] = DIRS[dirIdx];
        x += dx;
        y += dy;
      }
    }
  }

  private measureDensity(grid: string[][]): number {
    let trees = 0;
    for (let y = 0; y < WORK_SIZE; y++) {
      for (let x = 0; x < WORK_SIZE; x++) {
        if (grid[y][x] === 'T') trees++;
      }
    }
    return trees / (WORK_SIZE * WORK_SIZE);
  }

  private countTreeNeighbors(grid: string[][], x: number, y: number): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (grid[y + dy][x + dx] === 'T') count++;
      }
    }
    return count;
  }

  private applyClumping(grid: string[][], passes: number, wx: number, wy: number): void {
    const rng = mulberry32(wx * 9371 + wy * 2753 + 77777);

    for (let pass = 0; pass < passes; pass++) {
      const isolated: [number, number][] = [];
      const gaps: [number, number][] = [];

      for (let y = 1; y < WORK_SIZE - 1; y++) {
        for (let x = 1; x < WORK_SIZE - 1; x++) {
          const fade = edgeFade(x, y);
          if (rng() > fade) continue;

          const n = this.countTreeNeighbors(grid, x, y);
          if (grid[y][x] === 'T' && n <= 1) {
            isolated.push([y, x]);
          } else if (grid[y][x] === '.' && n >= 3 && n < 5) {
            gaps.push([y, x]);
          }
        }
      }

      for (let i = isolated.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [isolated[i], isolated[j]] = [isolated[j], isolated[i]];
      }

      const swaps = Math.min(isolated.length, gaps.length);
      for (let i = 0; i < swaps; i++) {
        const [ty, tx] = isolated[i];
        const [gy, gx] = gaps[i];
        grid[ty][tx] = '.';
        grid[gy][gx] = 'T';
      }
    }
  }

  private capDensity(grid: string[][], maxDensity: number, wx: number, wy: number): void {
    const rng = mulberry32(wx * 6131 + wy * 8191 + 54321);
    const trees: [number, number][] = [];
    for (let y = 0; y < WORK_SIZE; y++) {
      for (let x = 0; x < WORK_SIZE; x++) {
        if (grid[y][x] === 'T') trees.push([y, x]);
      }
    }
    const totalCells = WORK_SIZE * WORK_SIZE;
    const maxTrees = Math.floor(totalCells * maxDensity);
    if (trees.length <= maxTrees) return;

    for (let i = trees.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [trees[i], trees[j]] = [trees[j], trees[i]];
    }
    for (let i = maxTrees; i < trees.length; i++) {
      const [y, x] = trees[i];
      grid[y][x] = '.';
    }
  }

  private applyDiffusion(grid: string[][], wx: number, wy: number): void {
    const DIFFUSION_PASSES = 30;
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const rng = mulberry32(wx * 7919 + wy * 104729 + 31337);

    for (let pass = 0; pass < DIFFUSION_PASSES; pass++) {
      for (let y = 1; y < WORK_SIZE - 1; y++) {
        for (let x = 1; x < WORK_SIZE - 1; x++) {
          if (grid[y][x] !== 'T') continue;
          const fade = edgeFade(x, y);
          if (rng() > fade) continue;
          const dirIdx = Math.floor(rng() * 8);
          const [dy, dx] = DIRS[dirIdx];
          const ny = y + dy;
          const nx = x + dx;
          if (grid[ny][nx] === '.') {
            grid[ny][nx] = 'T';
            grid[y][x] = '.';
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
