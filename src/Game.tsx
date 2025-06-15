import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { World } from './ecs/World.js';
import { ViewportSystem } from './systems/ViewportSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { InputSystem } from './systems/InputSystem.js';
import { useInputSystem } from './hooks/useInputSystem.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { MapData } from './MapData.js';
import { RegionData } from './RegionData.js';
import { MountainData } from './MountainData.js';
import { Position } from './components/Position.js';
import { Renderable } from './components/Renderable.js';
import { Player } from './components/Player.js';
import { Movable } from './components/Movable.js';
import { MapDisplay, StyledTile } from './components/MapDisplay.js';
import { RegionDisplaySystem } from './systems/RegionDisplaySystem.js';

interface GameProps {
  mapFile: string;
}

export const Game: React.FC<GameProps> = ({ mapFile }) => {
  const [world] = useState(() => new World());
  const [mapData] = useState(() => new MapData());
  const [regionData] = useState(() => new RegionData());
  const [mountainData] = useState(() => new MountainData());
  const [inputSystem] = useState(() => new InputSystem());
  const [viewportSystem] = useState(() => new ViewportSystem(mapData));
  const [movementSystem] = useState(() => new MovementSystem(inputSystem, mapData, mountainData));
  const [renderSystem] = useState(() => new RenderSystem(viewportSystem, mountainData));
  const [regionDisplaySystem] = useState(() => new RegionDisplaySystem(regionData));
  const [mapDisplay, setMapDisplay] = useState<StyledTile[][]>([]);
  const [regionInfo, setRegionInfo] = useState<{ realm: string; subRegion: string } | null>(null);
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
    // Load map
    mapData.loadFromFile(mapFile);
    
    // Load region data
    regionData.loadFromFile('middle_earth_regions.bin', 'middle_earth_pois.csv');
    
    // Load mountain depth data
    mountainData.loadFromFile('middle_earth_mountains.bin');
    
    // Create player entity
    const player = world.createEntity();
    player.addComponent(new Player());
    player.addComponent(new Position(50, 50)); // Start near Hobbiton
    player.addComponent(new Renderable('@', 10, 'yellowBright')); // High priority, bright yellow
    player.addComponent(new Movable(1));
    
    // Add systems to world in correct order
    world.addSystem(inputSystem);
    world.addSystem(movementSystem);
    world.addSystem(regionDisplaySystem);
    world.addSystem(viewportSystem);
    world.addSystem(renderSystem);

    // Game loop
    const gameLoop = setInterval(() => {
      world.update(16); // ~60 FPS
      setMapDisplay(renderSystem.getStyledMap());
      setRegionInfo(regionDisplaySystem.getPlayerRegionInfo(world));
      forceUpdate({});
    }, 16);

    return () => clearInterval(gameLoop);
  }, [world, mapData, regionData, mountainData, inputSystem, viewportSystem, movementSystem, renderSystem, regionDisplaySystem, mapFile]);

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