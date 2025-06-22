export interface DataLoader {
  loadTextFile(filename: string): Promise<string>;
  loadBinaryFile(filename: string): Promise<ArrayBuffer>;
}