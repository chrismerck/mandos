import { ForestData } from '../ForestData.js';
import type { DataLoader } from '../../../shared/DataLoader.js';

function createTestBuffer(): ArrayBuffer {
  const width = 3;
  const height = 2;
  const buf = new ArrayBuffer(4 + 2 + 2 + 2 + width * height);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes[0] = 70; bytes[1] = 68; bytes[2] = 69; bytes[3] = 80; // FDEP
  view.setUint16(4, 1, true); // version
  view.setUint16(6, 3, true); // width
  view.setUint16(8, 2, true); // height
  // Row 0: depths 0, 1, 2
  bytes[10] = 0; bytes[11] = 1; bytes[12] = 2;
  // Row 1: depths 3, 4, 5
  bytes[13] = 3; bytes[14] = 4; bytes[15] = 5;
  return buf;
}

const mockLoader: DataLoader = {
  loadTextFile: async () => '',
  loadBinaryFile: async () => createTestBuffer(),
};

describe('ForestData', () => {
  let forestData: ForestData;

  beforeEach(async () => {
    forestData = new ForestData(mockLoader);
    await forestData.loadFromFile('test.bin');
  });

  it('returns correct depth values from parsed binary data', () => {
    expect(forestData.getDepth(0, 0)).toBe(0);
    expect(forestData.getDepth(1, 0)).toBe(1);
    expect(forestData.getDepth(2, 0)).toBe(2);
    expect(forestData.getDepth(0, 1)).toBe(3);
    expect(forestData.getDepth(1, 1)).toBe(4);
    expect(forestData.getDepth(2, 1)).toBe(5);
  });

  it('returns 0 for out-of-bounds coordinates', () => {
    expect(forestData.getDepth(-1, 0)).toBe(0);
    expect(forestData.getDepth(0, -1)).toBe(0);
    expect(forestData.getDepth(3, 0)).toBe(0);
    expect(forestData.getDepth(0, 2)).toBe(0);
    expect(forestData.getDepth(100, 100)).toBe(0);
  });

  it('returns 0 when data is not loaded', () => {
    const unloaded = new ForestData(mockLoader);
    expect(unloaded.getDepth(0, 0)).toBe(0);
  });

  it('isDeepForest returns true for depth >= 4', () => {
    expect(forestData.isDeepForest(1, 1)).toBe(true);  // depth 4
    expect(forestData.isDeepForest(2, 1)).toBe(true);  // depth 5
  });

  it('isDeepForest returns false for depth < 4', () => {
    expect(forestData.isDeepForest(0, 0)).toBe(false); // depth 0
    expect(forestData.isDeepForest(1, 0)).toBe(false); // depth 1
    expect(forestData.isDeepForest(0, 1)).toBe(false); // depth 3
  });

  it('isEdgeForest returns true for 0 < depth < 4', () => {
    expect(forestData.isEdgeForest(1, 0)).toBe(true);  // depth 1
    expect(forestData.isEdgeForest(2, 0)).toBe(true);  // depth 2
    expect(forestData.isEdgeForest(0, 1)).toBe(true);  // depth 3
  });

  it('isEdgeForest returns false for depth 0 or depth >= 4', () => {
    expect(forestData.isEdgeForest(0, 0)).toBe(false); // depth 0
    expect(forestData.isEdgeForest(1, 1)).toBe(false); // depth 4
    expect(forestData.isEdgeForest(2, 1)).toBe(false); // depth 5
  });

  it('throws on invalid magic number', async () => {
    const badLoader: DataLoader = {
      loadTextFile: async () => '',
      loadBinaryFile: async () => {
        const buf = new ArrayBuffer(16);
        const bytes = new Uint8Array(buf);
        bytes[0] = 88; bytes[1] = 88; bytes[2] = 88; bytes[3] = 88; // XXXX
        return buf;
      },
    };
    const fd = new ForestData(badLoader);
    await expect(fd.loadFromFile('bad.bin')).rejects.toThrow('FDEP');
  });

  it('throws on unsupported version', async () => {
    const badLoader: DataLoader = {
      loadTextFile: async () => '',
      loadBinaryFile: async () => {
        const buf = new ArrayBuffer(16);
        const view = new DataView(buf);
        const bytes = new Uint8Array(buf);
        bytes[0] = 70; bytes[1] = 68; bytes[2] = 69; bytes[3] = 80; // FDEP
        view.setUint16(4, 99, true); // bad version
        view.setUint16(6, 1, true);
        view.setUint16(8, 1, true);
        return buf;
      },
    };
    const fd = new ForestData(badLoader);
    await expect(fd.loadFromFile('bad.bin')).rejects.toThrow('Unsupported forest depth version');
  });
});
