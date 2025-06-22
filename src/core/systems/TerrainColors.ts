import { Color } from '../components/Renderable.js';

export interface TerrainStyle {
  color?: Color;
  backgroundColor?: Color;
  bold?: boolean;
  dim?: boolean;
}

export const TERRAIN_COLORS: Record<string, TerrainStyle> = {
  // Water (ocean and rivers - intermediate blue)
  '=': { color: 'blueBright' },
  '-': { color: 'blueBright' },
  '|': { color: 'blueBright' },
  
  // Mountains
  '^': { color: 'gray' },
  
  // Hills (brown)
  '~': { color: 'yellow' }, // yellow is closest to brown in standard terminal colors
  
  // Forest
  '&': { color: 'green' },
  
  // Plains/Roads
  '.': { color: 'gray' },
  
  // Towns/settlements
  'o': { color: 'white' },
  
  // Crossroads
  '+': { color: 'yellow' },
  '@': { color: 'white' }, // When used as paths/bridges
  
  // Special terrain
  '%': { color: 'green' }, // Marshes/special vegetation
  '"': { color: 'gray' }, // Special markers
  
  // Default (including spaces)
  ' ': {}
};

export function getTerrainStyle(char: string): TerrainStyle {
  return TERRAIN_COLORS[char] || { color: 'white' };
}