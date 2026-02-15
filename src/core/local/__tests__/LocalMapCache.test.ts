import { LocalMapCache } from '../LocalMapCache.js';

describe('LocalMapCache', () => {
  let cache: LocalMapCache;

  beforeEach(() => {
    cache = new LocalMapCache();
  });

  test('should return null for uncached tile', () => {
    expect(cache.get(5, 10)).toBeNull();
  });

  test('should store and retrieve a tile', () => {
    const grid = [['T', '.'], ['.', 'T']];
    cache.set(5, 10, grid);
    expect(cache.get(5, 10)).toEqual(grid);
  });

  test('should return has correctly', () => {
    expect(cache.has(5, 10)).toBe(false);
    cache.set(5, 10, [['T']]);
    expect(cache.has(5, 10)).toBe(true);
  });
});
