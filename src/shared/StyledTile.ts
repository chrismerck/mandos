import type { TerrainStyle } from '../core/systems/TerrainColors.js';

export interface StyledTile {
  char: string;
  style: TerrainStyle;
}