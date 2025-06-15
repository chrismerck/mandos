import React from 'react';
import { Box, Text } from 'ink';
import { Color } from './Renderable.js';
import { TerrainStyle } from '../systems/TerrainColors.js';

export interface StyledTile {
  char: string;
  style: TerrainStyle;
}

interface MapDisplayProps {
  tiles: StyledTile[][];
}

export const MapDisplay: React.FC<MapDisplayProps> = ({ tiles }) => {
  // Helper to check if two styles are the same
  const isSameStyle = (a: TerrainStyle, b: TerrainStyle): boolean => {
    return a.color === b.color && 
           a.backgroundColor === b.backgroundColor && 
           a.bold === b.bold && 
           a.dim === b.dim;
  };

  return (
    <Box flexDirection="column">
      {tiles.map((row, y) => {
        // Group consecutive tiles with the same style
        const groups: { chars: string; style: TerrainStyle }[] = [];
        let currentGroup: { chars: string; style: TerrainStyle } | null = null;

        row.forEach((tile) => {
          if (currentGroup && isSameStyle(currentGroup.style, tile.style)) {
            currentGroup.chars += tile.char;
          } else {
            if (currentGroup) {
              groups.push(currentGroup);
            }
            currentGroup = { chars: tile.char, style: tile.style };
          }
        });
        
        if (currentGroup) {
          groups.push(currentGroup);
        }

        return (
          <Box key={`row-${y}`}>
            {groups.map((group, i) => (
              <Text
                key={`group-${y}-${i}`}
                color={group.style.color}
                backgroundColor={group.style.backgroundColor}
              >
                {group.chars}
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
};