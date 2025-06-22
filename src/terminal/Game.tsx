import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { World } from '../core/ecs/World.js';
import { ViewportSystem } from '../core/systems/ViewportSystem.js';
import { RenderSystem } from '../core/systems/RenderSystem.js';
import { InputSystem } from '../core/systems/InputSystem.js';
import { useInputSystem } from './hooks/useInputSystem.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { MovementSystem } from '../core/systems/MovementSystem.js';
import { MapData } from '../core/data/MapData.js';
import { RegionData } from '../core/data/RegionData.js';
import { MountainData } from '../core/data/MountainData.js';
import { Position } from '../core/components/Position.js';
import { Renderable } from '../core/components/Renderable.js';
import { Player } from '../core/components/Player.js';
import { Movable } from '../core/components/Movable.js';
import { MapDisplay } from './MapDisplay.js';
import type { StyledTile } from '../shared/StyledTile.js';
import { RegionDisplaySystem } from '../core/systems/RegionDisplaySystem.js';
import { NodeDataLoader } from './NodeDataLoader.js';

interface GameProps {
  mapFile: string;
}

export const Game: React.FC<GameProps> = ({ mapFile }) => {
  const [world] = useState(() => new World());
  const [dataLoader] = useState(() => new NodeDataLoader());
  const [mapData] = useState(() => new MapData(dataLoader));
  const [regionData] = useState(() => new RegionData(dataLoader));
  const [mountainData] = useState(() => new MountainData(dataLoader));
  const [inputSystem] = useState(() => new InputSystem());
  const [viewportSystem] = useState(() => new ViewportSystem(mapData));
  const [movementSystem] = useState(() => new MovementSystem(inputSystem, mapData, mountainData));
  const [renderSystem] = useState(() => new RenderSystem(viewportSystem, mountainData));
  const [regionDisplaySystem] = useState(() => new RegionDisplaySystem(regionData));
  const [mapDisplay, setMapDisplay] = useState<StyledTile[][]>([]);
  const [regionInfo, setRegionInfo] = useState<{ realm: string; subRegion: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, forceUpdate] = useState({});

  // Connect ink input to our input system
  useInputSystem(inputSystem);
  
  // Get terminal size
  const terminalSize = useTerminalSize();
  
  // Calculate viewport size accounting for UI elements
  const viewportWidth = Math.max(20, terminalSize.columns - 2); // -2 for border
  const viewportHeight = Math.max(10, terminalSize.rows - 8); // -8 for top (2 lines), bottom (2 lines), border (2), and controls (2)
  
  // Update viewport size when terminal resizes
  useEffect(() => {
    viewportSystem.setViewportSize(viewportWidth, viewportHeight);
  }, [viewportSystem, viewportWidth, viewportHeight]);

  useEffect(() => {
    // Load all data asynchronously
    const loadData = async () => {
      try {
        await mapData.loadFromFile(mapFile);
        await regionData.loadFromFile('middle_earth_regions.bin', 'middle_earth_pois.csv');
        await mountainData.loadFromFile('middle_earth_mountains.bin');
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };
    
    loadData();
    
    // Create player entity only after data is loaded
    const initGame = () => {
      if (isLoading) return;
      
      // Only create player entity once
      const players = world.getEntitiesWithComponent('Player');
      if (players.length === 0) {
        const player = world.createEntity();
        player.addComponent(new Player());
        player.addComponent(new Position(145, 49)); // Start at Hobbiton (col, row)
        player.addComponent(new Renderable('@', 10, 'yellowBright')); // High priority, bright yellow
        player.addComponent(new Movable(1));
        
        // Add systems to world in correct order
        world.addSystem(inputSystem);
        world.addSystem(movementSystem);
        world.addSystem(regionDisplaySystem);
        world.addSystem(viewportSystem);
        world.addSystem(renderSystem);
      }

    };
    
    initGame();
    
    // Game loop
    const gameLoop = setInterval(() => {
      if (isLoading) return;
      world.update(16); // ~60 FPS
      setMapDisplay(renderSystem.getStyledMap());
      setRegionInfo(regionDisplaySystem.getPlayerRegionInfo(world));
      forceUpdate({});
    }, 16);

    return () => clearInterval(gameLoop);
  }, [world, mapData, regionData, mountainData, inputSystem, viewportSystem, movementSystem, renderSystem, regionDisplaySystem, mapFile, dataLoader, isLoading]);

  if (isLoading) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center">
        <Text>Loading Middle Earth...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Top space - 2 lines */}
      <Box height={2} flexDirection="column">
        <Text> </Text>
        <Text> </Text>
      </Box>
      
      {/* Map viewport */}
      <Box borderStyle="single" padding={0}>
        <MapDisplay tiles={mapDisplay} />
      </Box>
      
      {/* Bottom space - 2 lines for info */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>Numpad/hjklyubn/Arrows to move (8 directions) | @ = You | Ctrl+C to exit</Text>
          {regionInfo && (
            <Text color="cyan"> | {regionInfo.realm}
              {regionInfo.subRegion && ` - ${regionInfo.subRegion}`}
            </Text>
          )}
        </Box>
        <Text> </Text>
      </Box>
    </Box>
  );
};