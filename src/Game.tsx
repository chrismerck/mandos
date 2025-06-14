import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { World } from './ecs/World.js';
import { ViewportSystem } from './systems/ViewportSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { InputSystem } from './systems/InputSystem.js';
import { useInputSystem } from './hooks/useInputSystem.js';
import { MovementSystem } from './systems/MovementSystem.js';
import { MapData } from './MapData.js';
import { Position } from './components/Position.js';
import { Renderable } from './components/Renderable.js';
import { Player } from './components/Player.js';
import { Movable } from './components/Movable.js';

interface GameProps {
  mapFile: string;
}

export const Game: React.FC<GameProps> = ({ mapFile }) => {
  const [world] = useState(() => new World());
  const [mapData] = useState(() => new MapData());
  const [inputSystem] = useState(() => new InputSystem());
  const [viewportSystem] = useState(() => new ViewportSystem(mapData, 80, 20));
  const [movementSystem] = useState(() => new MovementSystem(inputSystem, mapData));
  const [renderSystem] = useState(() => new RenderSystem(viewportSystem));
  const [mapDisplay, setMapDisplay] = useState<string>('');
  const [, forceUpdate] = useState({});

  // Connect ink input to our input system
  useInputSystem(inputSystem);

  useEffect(() => {
    // Load map
    mapData.loadFromFile(mapFile);
    
    // Create player entity
    const player = world.createEntity();
    player.addComponent(new Player());
    player.addComponent(new Position(50, 50)); // Start near Hobbiton
    player.addComponent(new Renderable('@', 10)); // High priority to render on top
    player.addComponent(new Movable(1));
    
    // Add systems to world in correct order
    world.addSystem(inputSystem);
    world.addSystem(movementSystem);
    world.addSystem(viewportSystem);
    world.addSystem(renderSystem);

    // Game loop
    const gameLoop = setInterval(() => {
      world.update(16); // ~60 FPS
      setMapDisplay(renderSystem.getRenderedString());
      forceUpdate({});
    }, 16);

    return () => clearInterval(gameLoop);
  }, [world, mapData, inputSystem, viewportSystem, movementSystem, renderSystem, mapFile]);

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" padding={0}>
        <Text>{mapDisplay}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Arrow keys or hjkl to move | @ = You | Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};