import { LocalMapGenerator } from '../LocalMapGenerator.js';
import { MapData } from '../../data/MapData.js';
import { ForestData } from '../../data/ForestData.js';

class MockMapData {
  width = 10;
  height = 10;
  private grid: string[][];

  constructor() {
    this.grid = Array.from({ length: 10 }, () => Array(10).fill(' '));
    for (let y = 3; y <= 6; y++) {
      for (let x = 3; x <= 6; x++) {
        this.grid[y][x] = '&';
      }
    }
  }

  getTile(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return ' ';
    return this.grid[y][x];
  }
}

class MockForestData {
  getDepth(x: number, y: number): number {
    if (x >= 4 && x <= 5 && y >= 4 && y <= 5) return 2;
    if (x >= 3 && x <= 6 && y >= 3 && y <= 6) return 1;
    return 0;
  }
}

describe('LocalMapGenerator', () => {
  let generator: LocalMapGenerator;

  beforeEach(() => {
    generator = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      42
    );
  });

  test('should generate a 43x43 grid', () => {
    const grid = generator.generateTile(4, 4);
    expect(grid.length).toBe(43);
    expect(grid[0].length).toBe(43);
  });

  test('should only contain valid characters', () => {
    const grid = generator.generateTile(4, 4);
    const validChars = new Set(['T', '.', '&', '"']);
    for (const row of grid) {
      for (const cell of row) {
        expect(validChars.has(cell)).toBe(true);
      }
    }
  });

  test('should have more trees in forest tiles than plains tiles', () => {
    const forestGrid = generator.generateTile(4, 4);
    const plainsGrid = generator.generateTile(1, 1);
    const countTrees = (grid: string[][]) =>
      grid.flat().filter(c => c === 'T').length;
    expect(countTrees(forestGrid)).toBeGreaterThan(countTrees(plainsGrid));
  });

  test('should be deterministic with same seed', () => {
    const grid1 = generator.generateTile(4, 4);
    const generator2 = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      42
    );
    const grid2 = generator2.generateTile(4, 4);
    expect(grid1).toEqual(grid2);
  });

  test('should produce different results with different seeds', () => {
    const grid1 = generator.generateTile(4, 4);
    const generator2 = new LocalMapGenerator(
      new MockMapData() as unknown as MapData,
      new MockForestData() as unknown as ForestData,
      99
    );
    const grid2 = generator2.generateTile(4, 4);
    expect(grid1.flat().join('')).not.toEqual(grid2.flat().join(''));
  });
});
