import type { DataLoader } from '../shared/DataLoader.js';

export class WebDataLoader implements DataLoader {
  private basePath: string;

  constructor(basePath?: string) {
    // Use the base URL from Vite config
    const base = import.meta.env.BASE_URL || '/';
    this.basePath = basePath || `${base}maps/`;
  }

  async loadTextFile(filename: string): Promise<string> {
    const url = this.basePath + filename;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText} (URL: ${url})`);
      }
      return response.text();
    } catch (error) {
      throw new Error(`WebDataLoader.loadTextFile failed for ${filename}: ${error} (at src/web/WebDataLoader.ts:13)`);
    }
  }

  async loadBinaryFile(filename: string): Promise<ArrayBuffer> {
    const url = this.basePath + filename;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText} (URL: ${url})`);
      }
      return response.arrayBuffer();
    } catch (error) {
      throw new Error(`WebDataLoader.loadBinaryFile failed for ${filename}: ${error} (at src/web/WebDataLoader.ts:26)`);
    }
  }
}