export interface DensityEntry {
  treeDensity: number;
  brambleMargin: number;
  herbMargin: number;
}

export const FOREST_DENSITY_CURVE: DensityEntry[] = [
  { treeDensity: 0.00, brambleMargin: 0.00, herbMargin: 0.00 },
  { treeDensity: 0.12, brambleMargin: 0.03, herbMargin: 0.05 },
  { treeDensity: 0.25, brambleMargin: 0.05, herbMargin: 0.06 },
  { treeDensity: 0.40, brambleMargin: 0.07, herbMargin: 0.06 },
  { treeDensity: 0.55, brambleMargin: 0.10, herbMargin: 0.05 },
  { treeDensity: 0.65, brambleMargin: 0.12, herbMargin: 0.04 },
  { treeDensity: 0.75, brambleMargin: 0.15, herbMargin: 0.03 },
];

export function getDensityForDepth(depth: number): DensityEntry {
  const index = Math.min(depth, FOREST_DENSITY_CURVE.length - 1);
  return FOREST_DENSITY_CURVE[index];
}
