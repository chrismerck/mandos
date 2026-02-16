export const FOREST_DENSITY_CURVE: number[] = [
  0.00,
  0.40,
  0.52,
  0.58,
  0.62,
  0.65,
  0.67,
];

export function getDensityForDepth(depth: number): number {
  const index = Math.min(depth, FOREST_DENSITY_CURVE.length - 1);
  return FOREST_DENSITY_CURVE[index];
}
