import React, { useRef, useEffect } from 'react';
import type { StyledTile } from '../shared/StyledTile.js';
import type { Color } from '../core/components/Renderable.js';

interface CanvasDisplayProps {
  tiles: StyledTile[][];
}

// Convert terminal colors to web colors
const colorMap: Record<string, string> = {
  // Basic colors
  'black': '#000000',
  'red': '#800000',
  'green': '#008000',
  'yellow': '#808000',
  'blue': '#000080',
  'magenta': '#800080',
  'cyan': '#008080',
  'white': '#c0c0c0',
  'gray': '#808080',
  'grey': '#808080',
  
  // Bright colors
  'redBright': '#ff0000',
  'greenBright': '#00ff00',
  'yellowBright': '#ffff00',
  'blueBright': '#0080ff',  // Intermediate blue for water
  'magentaBright': '#ff00ff',
  'cyanBright': '#00ffff',
  'whiteBright': '#ffffff',
};

const getWebColor = (color?: Color): string => {
  if (!color) return '#ffffff';
  if (typeof color === 'string') {
    return colorMap[color] || '#ffffff';
  }
  // Handle RGB array [r, g, b]
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
};

export const CanvasDisplay: React.FC<CanvasDisplayProps> = ({ tiles }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Character dimensions
    const charWidth = 10;
    const charHeight = 20;
    const fontSize = 16;
    
    // Calculate canvas size
    const rows = tiles.length;
    const cols = tiles[0]?.length || 0;
    canvas.width = cols * charWidth;
    canvas.height = rows * charHeight;
    
    // Set font
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'top';
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw tiles
    tiles.forEach((row, y) => {
      row.forEach((tile, x) => {
        const xPos = x * charWidth;
        const yPos = y * charHeight;
        
        // Draw background if specified
        if (tile.style.backgroundColor) {
          ctx.fillStyle = getWebColor(tile.style.backgroundColor);
          ctx.fillRect(xPos, yPos, charWidth, charHeight);
        }
        
        // Set text style
        ctx.fillStyle = getWebColor(tile.style.color);
        if (tile.style.bold) {
          ctx.font = `bold ${fontSize}px monospace`;
        } else {
          ctx.font = `${fontSize}px monospace`;
        }
        
        // Apply dim effect with transparency
        if (tile.style.dim) {
          ctx.globalAlpha = 0.6;
        } else {
          ctx.globalAlpha = 1.0;
        }
        
        // Draw character
        ctx.fillText(tile.char, xPos, yPos + 2); // +2 for better vertical alignment
      });
    });
  }, [tiles]);
  
  return (
    <canvas 
      ref={canvasRef}
      style={{
        border: '2px solid #333',
        backgroundColor: '#000',
        imageRendering: 'pixelated'
      }}
    />
  );
};