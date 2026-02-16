import { createNoise2D } from 'simplex-noise';
import { MapData } from '../data/MapData.js';
import { ForestData } from '../data/ForestData.js';
import { RiverFlowData } from '../data/RiverFlowData.js';
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
    private riverFlowData: RiverFlowData,
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
    const result = this.trimBorder(work);
    this.overlayStreams(result, wx, wy);
    this.clearBanks(result, wx, wy);
    return result;
  }

  private buildDensityGrid(wx: number, wy: number): number[][] {
    const depths: number[][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const row: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        row.push(this.forestData.getDepth(wx + dx, wy + dy));
      }
      depths.push(row);
    }

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (this.riverFlowData.isRiver(wx + dx, wy + dy) && depths[dy + 1][dx + 1] === 0) {
          let sum = 0;
          let count = 0;
          for (let ny = -1; ny <= 1; ny++) {
            for (let nx = -1; nx <= 1; nx++) {
              const d = this.forestData.getDepth(wx + dx + nx, wy + dy + ny);
              if (d > 0) { sum += d; count++; }
            }
          }
          if (count > 0) depths[dy + 1][dx + 1] = Math.round(sum / count);
        }
      }
    }

    const grid: number[][] = [];
    for (let dy = 0; dy < 3; dy++) {
      const row: number[] = [];
      for (let dx = 0; dx < 3; dx++) {
        row.push(getDensityForDepth(depths[dy][dx]));
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

  private hashCoord(a: number, b: number, c: number, d: number): number {
    let h = a * 374761393 + b * 668265263 + c * 1274126177 + d;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return Math.abs(h);
  }

  private getCrossingPoint(wx1: number, wy1: number, wx2: number, wy2: number, seed: number): number {
    const h = this.hashCoord(
      Math.min(wx1, wx2), Math.max(wx1, wx2),
      Math.min(wy1, wy2), Math.max(wy1, wy2) + seed
    );
    return (h % 33) + 5;
  }

  private computeLocalWidth(wx: number, wy: number): number {
    const flowInfo = this.riverFlowData.getFlow(wx, wy);
    if (!flowInfo) return 1;
    const normalized = flowInfo.flow / flowInfo.maxFlow / 5;
    return Math.max(1, Math.round(Math.sqrt(normalized) * 20));
  }

  private getStreamEntryExitPoints(wx: number, wy: number): Array<{ x: number; y: number; side: string }> {
    const points: Array<{ x: number; y: number; side: string }> = [];
    const RIVER_SEED = 99997;

    const neighbors: Array<{ dx: number; dy: number; side: string }> = [
      { dx: 0, dy: -1, side: 'north' },
      { dx: 1, dy: 0, side: 'east' },
      { dx: 0, dy: 1, side: 'south' },
      { dx: -1, dy: 0, side: 'west' },
    ];

    for (const { dx, dy, side } of neighbors) {
      const nx = wx + dx;
      const ny = wy + dy;
      if (this.riverFlowData.isRiver(nx, ny)) {
        if (side === 'north' || side === 'south') {
          const cx = this.getCrossingPoint(wx, wy, nx, ny, RIVER_SEED);
          const cy = side === 'north' ? 0 : TILE_SIZE - 1;
          points.push({ x: cx, y: cy, side });
        } else {
          const cy = this.getCrossingPoint(wx, wy, nx, ny, RIVER_SEED);
          const cx = side === 'west' ? 0 : TILE_SIZE - 1;
          points.push({ x: cx, y: cy, side });
        }
      }
    }

    return points;
  }

  private midpointDisplace(
    points: Array<{ x: number; y: number }>,
    rng: () => number,
    amplitude: number,
    depth: number
  ): Array<{ x: number; y: number }> {
    if (depth <= 0 || points.length < 2) return points;

    const result: Array<{ x: number; y: number }> = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) {
        result.push(b);
        continue;
      }
      const nx = -dy / len;
      const ny = dx / len;
      const disp = (rng() - 0.5) * amplitude;
      result.push({ x: mx + nx * disp, y: my + ny * disp });
      result.push(b);
    }

    return this.midpointDisplace(result, rng, amplitude * 0.5, depth - 1);
  }

  private guidePoint(p: { x: number; y: number; side: string }, inset: number): { x: number; y: number } {
    switch (p.side) {
      case 'north': return { x: p.x, y: p.y + inset };
      case 'south': return { x: p.x, y: p.y - inset };
      case 'east':  return { x: p.x - inset, y: p.y };
      case 'west':  return { x: p.x + inset, y: p.y };
      default:      return { x: p.x, y: p.y };
    }
  }

  private smoothPath(
    points: Array<{ x: number; y: number }>,
    passes: number
  ): Array<{ x: number; y: number }> {
    let path = points;
    for (let p = 0; p < passes; p++) {
      const result: Array<{ x: number; y: number }> = [path[0]];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        result.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        result.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      }
      result.push(path[path.length - 1]);
      path = result;
    }
    return path;
  }

  private rasterizePath(
    grid: string[][],
    path: Array<{ x: number; y: number }>,
    width: number
  ): void {
    const halfW = width / 2;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(len));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        const r = Math.ceil(halfW);
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            if (ox * ox + oy * oy <= halfW * halfW) {
              const px = Math.round(cx + ox);
              const py = Math.round(cy + oy);
              if (px >= 0 && px < TILE_SIZE && py >= 0 && py < TILE_SIZE) {
                grid[py][px] = '=';
              }
            }
          }
        }
      }
    }
  }

  private overlayStreams(grid: string[][], wx: number, wy: number): void {
    if (!this.riverFlowData.isRiver(wx, wy)) return;

    const width = this.computeLocalWidth(wx, wy);
    const points = this.getStreamEntryExitPoints(wx, wy);
    const rng = mulberry32(wx * 13337 + wy * 7919 + 42424);

    if (points.length === 0) {
      const cx = 15 + Math.floor(rng() * 13);
      const cy = 15 + Math.floor(rng() * 13);
      const r = Math.max(1, Math.floor(width / 2));
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox * ox + oy * oy <= r * r) {
            const px = cx + ox;
            const py = cy + oy;
            if (px >= 0 && px < TILE_SIZE && py >= 0 && py < TILE_SIZE) {
              grid[py][px] = '=';
            }
          }
        }
      }
      return;
    }

    const INSET = 8;

    if (points.length === 1) {
      const entry = points[0];
      const guide = this.guidePoint(entry, INSET);
      const cx = TILE_SIZE / 2 + (rng() - 0.5) * 10;
      const cy = TILE_SIZE / 2 + (rng() - 0.5) * 10;
      const amplitude = Math.max(4, 20 / Math.max(1, width));
      const path = this.smoothPath(this.midpointDisplace(
        [{ x: entry.x, y: entry.y }, guide, { x: cx, y: cy }],
        rng, amplitude, 5
      ), 2);
      this.rasterizePath(grid, path, width);
      return;
    }

    const withFlow = points.map(p => {
      const dx = p.side === 'east' ? 1 : p.side === 'west' ? -1 : 0;
      const dy = p.side === 'south' ? 1 : p.side === 'north' ? -1 : 0;
      const nflow = this.riverFlowData.getFlow(wx + dx, wy + dy);
      return { ...p, neighborFlow: nflow ? nflow.flow : 0 };
    });
    withFlow.sort((a, b) => b.neighborFlow - a.neighborFlow);

    const amplitude = Math.max(4, 20 / Math.max(1, width));
    const g0 = this.guidePoint(withFlow[0], INSET);
    const g1 = this.guidePoint(withFlow[1], INSET);
    const mainPath = this.smoothPath(this.midpointDisplace(
      [{ x: withFlow[0].x, y: withFlow[0].y }, g0, g1, { x: withFlow[1].x, y: withFlow[1].y }],
      rng, amplitude, 5
    ), 2);
    this.rasterizePath(grid, mainPath, width);

    for (let i = 2; i < withFlow.length; i++) {
      const p = withFlow[i];
      const mid = mainPath[Math.floor(mainPath.length / 2)];
      const nflow = this.riverFlowData.getFlow(wx + (p.side === 'east' ? 1 : p.side === 'west' ? -1 : 0),
                                                wy + (p.side === 'south' ? 1 : p.side === 'north' ? -1 : 0));
      const tribWidth = nflow ? Math.max(1, Math.round(Math.sqrt(nflow.flow / nflow.maxFlow / 5) * 20)) : 1;
      const gTrib = this.guidePoint(p, INSET);
      const tribPath = this.smoothPath(this.midpointDisplace(
        [{ x: p.x, y: p.y }, gTrib, { x: mid.x, y: mid.y }],
        rng, amplitude, 5
      ), 2);
      this.rasterizePath(grid, tribPath, tribWidth);
    }
  }

  private clearBanks(grid: string[][], wx: number, wy: number): void {
    if (!this.riverFlowData.isRiver(wx, wy)) return;

    const width = this.computeLocalWidth(wx, wy);
    const widthFactor = 0.7 + 0.3 * Math.min(1, width / 10);
    const baseClear = [0.95, 0.80, 0.60, 0.40];
    const maxLayers = Math.max(3, Math.ceil(widthFactor * 4));
    const rng = mulberry32(wx * 8311 + wy * 5443 + 77177);

    const dist: number[][] = [];
    for (let y = 0; y < TILE_SIZE; y++) {
      dist.push(new Array(TILE_SIZE).fill(-1));
    }

    const queue: Array<[number, number]> = [];
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        if (grid[y][x] === '=') {
          dist[y][x] = 0;
          queue.push([y, x]);
        }
      }
    }

    let head = 0;
    while (head < queue.length) {
      const [cy, cx] = queue[head++];
      const d = dist[cy][cx];
      if (d >= maxLayers) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = cy + dy;
          const nx = cx + dx;
          if (ny >= 0 && ny < TILE_SIZE && nx >= 0 && nx < TILE_SIZE && dist[ny][nx] === -1) {
            dist[ny][nx] = d + 1;
            queue.push([ny, nx]);
          }
        }
      }
    }

    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const d = dist[y][x];
        if (d > 0 && d <= maxLayers && grid[y][x] === 'T') {
          const clearChance = baseClear[d - 1] * widthFactor;
          if (rng() < clearChance) {
            grid[y][x] = '.';
          }
        }
      }
    }
  }
}
