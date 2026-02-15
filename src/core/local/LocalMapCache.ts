export class LocalMapCache {
  private cache = new Map<string, string[][]>();

  private key(wx: number, wy: number): string {
    return `${wx},${wy}`;
  }

  get(wx: number, wy: number): string[][] | null {
    return this.cache.get(this.key(wx, wy)) ?? null;
  }

  set(wx: number, wy: number, grid: string[][]): void {
    this.cache.set(this.key(wx, wy), grid);
  }

  has(wx: number, wy: number): boolean {
    return this.cache.has(this.key(wx, wy));
  }
}
