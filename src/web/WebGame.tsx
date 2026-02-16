import React, { useState, useEffect, useRef } from 'react';
import { World } from '../core/ecs/World.js';
import { ViewportSystem } from '../core/systems/ViewportSystem.js';
import { RenderSystem } from '../core/systems/RenderSystem.js';
import { InputSystem } from '../core/systems/InputSystem.js';
import { MovementSystem } from '../core/systems/MovementSystem.js';
import { MapData } from '../core/data/MapData.js';
import { RegionData } from '../core/data/RegionData.js';
import { MountainData } from '../core/data/MountainData.js';
import { PoiRiverData } from '../core/data/PoiRiverData.js';
import { ForestData } from '../core/data/ForestData.js';
import { RiverFlowData } from '../core/data/RiverFlowData.js';
import { Position } from '../core/components/Position.js';
import { Renderable } from '../core/components/Renderable.js';
import { Player } from '../core/components/Player.js';
import { Movable } from '../core/components/Movable.js';
import { ViewMode } from '../core/components/ViewMode.js';
import { LocalPosition } from '../core/components/LocalPosition.js';
import { RegionDisplaySystem } from '../core/systems/RegionDisplaySystem.js';
import { LocalMapGenerator } from '../core/local/LocalMapGenerator.js';
import { LocalMapCache } from '../core/local/LocalMapCache.js';
import { LocalViewportSystem } from '../core/systems/LocalViewportSystem.js';
import { LocalMovementSystem } from '../core/systems/LocalMovementSystem.js';
import { LocalRenderSystem } from '../core/systems/LocalRenderSystem.js';
import { WebDataLoader } from './WebDataLoader.js';
import { CanvasDisplay } from './CanvasDisplay.js';
import type { StyledTile } from '../shared/StyledTile.js';

interface WebGameProps {
  mapFile: string;
}

export const WebGame: React.FC<WebGameProps> = ({ mapFile }) => {
  const [world] = useState(() => new World());
  const [dataLoader] = useState(() => new WebDataLoader());
  const [mapData] = useState(() => new MapData(dataLoader));
  const [regionData] = useState(() => new RegionData(dataLoader));
  const [mountainData] = useState(() => new MountainData(dataLoader));
  const [poiRiverData] = useState(() => new PoiRiverData(dataLoader));
  const [inputSystem] = useState(() => new InputSystem());
  const [viewportSystem] = useState(() => new ViewportSystem(mapData));
  const [movementSystem] = useState(() => new MovementSystem(inputSystem, mapData, mountainData));
  const [renderSystem] = useState(() => new RenderSystem(viewportSystem, mountainData));
  const [regionDisplaySystem] = useState(() => new RegionDisplaySystem(regionData, poiRiverData));
  const [forestData] = useState(() => new ForestData(dataLoader));
  const [riverFlowData] = useState(() => new RiverFlowData(dataLoader));
  const [localMapCache] = useState(() => new LocalMapCache());
  const [viewMode, setViewMode] = useState<'world' | 'local'>('world');
  const viewModeRef = useRef<'world' | 'local'>('world');
  const localSystemsRef = useRef<{
    generator: LocalMapGenerator;
    viewportSys: LocalViewportSystem;
    movementSys: LocalMovementSystem;
    renderSys: LocalRenderSystem;
  } | null>(null);
  const [mapDisplay, setMapDisplay] = useState<StyledTile[][]>([]);
  const [regionInfo, setRegionInfo] = useState<{ realm: string; subRegion: string; poiName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number>();

  // Calculate viewport size based on window
  const calculateViewportSize = () => {
    const charWidth = 10; // Approximate character width in pixels
    const charHeight = 20; // Approximate character height in pixels
    const padding = 100; // UI padding
    
    const viewportWidth = Math.floor((window.innerWidth - padding) / charWidth);
    const viewportHeight = Math.floor((window.innerHeight - padding) / charHeight);
    
    // Clamp to reasonable sizes
    return {
      width: Math.min(Math.max(viewportWidth, 40), 120),
      height: Math.min(Math.max(viewportHeight, 20), 40)
    };
  };

  const [viewportSize, setViewportSize] = useState(calculateViewportSize);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setViewportSize(calculateViewportSize());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update viewport size when it changes
  useEffect(() => {
    viewportSystem.setViewportSize(viewportSize.width, viewportSize.height);
  }, [viewportSystem, viewportSize]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Keyboard input handling
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevent default browser scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }

      // Arrow keys
      switch (e.key) {
        case 'ArrowUp':
        case 'k':
        case '8':
          inputSystem.setDirection('up');
          break;
        case 'ArrowDown':
        case 'j':
        case '2':
          inputSystem.setDirection('down');
          break;
        case 'ArrowLeft':
        case 'h':
        case '4':
          inputSystem.setDirection('left');
          break;
        case 'ArrowRight':
        case 'l':
        case '6':
          inputSystem.setDirection('right');
          break;
        // Diagonal movements
        case 'y':
        case '7':
          inputSystem.setDirection('up-left');
          break;
        case 'u':
        case '9':
          inputSystem.setDirection('up-right');
          break;
        case 'b':
        case '1':
          inputSystem.setDirection('down-left');
          break;
        case 'n':
        case '3':
          inputSystem.setDirection('down-right');
          break;
        case 'm':
        case 'M': {
          const player = world.getEntitiesWithComponent('Player')[0];
          if (!player || !localSystemsRef.current) break;

          const currentMode = player.getComponent<ViewMode>('ViewMode');
          if (!currentMode || currentMode.mode === 'world') {
            const pos = player.getComponent<Position>('Position')!;

            if (!player.hasComponent('ViewMode')) {
              player.addComponent(new ViewMode('local'));
            } else {
              currentMode!.mode = 'local';
            }

            if (!player.hasComponent('LocalPosition')) {
              player.addComponent(new LocalPosition(pos.x, pos.y, 21, 21));
            } else {
              const lp = player.getComponent<LocalPosition>('LocalPosition')!;
              lp.wx = pos.x;
              lp.wy = pos.y;
              lp.lx = 21;
              lp.ly = 21;
            }

            localSystemsRef.current.movementSys.ensureNeighborsGenerated(pos.x, pos.y);
            setViewMode('local');
          } else {
            currentMode.mode = 'world';

            const lp = player.getComponent<LocalPosition>('LocalPosition');
            if (lp) {
              const pos = player.getComponent<Position>('Position')!;
              pos.x = lp.wx;
              pos.y = lp.wy;
            }

            setViewMode('world');
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [inputSystem, world]);

  // Load game data and initialize
  useEffect(() => {
    const loadData = async () => {
      try {
        await mapData.loadFromFile(mapFile);
        await regionData.loadFromFile('middle_earth_regions.bin', 'middle_earth_pois.csv');
        await mountainData.loadFromFile('middle_earth_mountains.bin');
        await poiRiverData.loadFromFile('middle_earth_poi_rivers.bin');
        await forestData.loadFromFile('middle_earth_forests.bin');
        await riverFlowData.loadFromFile('middle_earth_river_flow.bin');

        const localGenerator = new LocalMapGenerator(mapData, forestData, riverFlowData, 42);
        const localViewportSys = new LocalViewportSystem(localMapCache);
        const localMovementSys = new LocalMovementSystem(inputSystem, localMapCache, localGenerator);
        const localRenderSys = new LocalRenderSystem(localViewportSys);
        localSystemsRef.current = {
          generator: localGenerator,
          viewportSys: localViewportSys,
          movementSys: localMovementSys,
          renderSys: localRenderSys,
        };

        // Create player entity only once
        const players = world.getEntitiesWithComponent('Player');
        if (players.length === 0) {
          const player = world.createEntity();
          player.addComponent(new Player());
          player.addComponent(new Position(145, 49)); // Start at Hobbiton
          player.addComponent(new Renderable('@', 10, 'yellowBright'));
          player.addComponent(new Movable(1));
          
          // Add systems to world
          world.addSystem(inputSystem);
          world.addSystem(movementSystem);
          world.addSystem(regionDisplaySystem);
          world.addSystem(viewportSystem);
          world.addSystem(renderSystem);
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load game data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load game data');
      }
    };
    
    loadData();
  }, [world, mapData, regionData, mountainData, poiRiverData, forestData, localMapCache, inputSystem, viewportSystem, movementSystem, renderSystem, regionDisplaySystem, mapFile]);

  // Game loop
  useEffect(() => {
    if (isLoading) return;

    let lastTime = performance.now();
    
    const gameLoop = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      if (viewModeRef.current === 'world') {
        world.update(deltaTime);
        setMapDisplay(renderSystem.getStyledMap());
        setRegionInfo(regionDisplaySystem.getPlayerRegionInfo(world));
      } else if (localSystemsRef.current) {
        inputSystem.update(world, deltaTime);
        localSystemsRef.current.movementSys.update(world, deltaTime);
        localSystemsRef.current.viewportSys.update(world, deltaTime);
        localSystemsRef.current.renderSys.update(world, deltaTime);
        setMapDisplay(localSystemsRef.current.renderSys.getStyledMap());
        setRegionInfo(null);
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [world, renderSystem, regionDisplaySystem, isLoading]);

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100vh',
        color: '#ff0000',
        fontFamily: 'monospace'
      }}>
        <h2>Error Loading Game</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100vh',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontSize: '24px'
      }}>
        Loading Middle Earth...
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px',
      fontFamily: 'monospace'
    }}>
      <CanvasDisplay tiles={mapDisplay} />
      
      <div style={{ 
        marginTop: '20px',
        color: '#888',
        fontSize: '14px'
      }}>
        <div>
          {viewMode === 'world'
            ? 'Numpad/hjklyubn/Arrows to move | M = Enter local view | @ = You'
            : 'Numpad/hjklyubn/Arrows to move | M = World map | @ = You'}
        </div>
        {regionInfo && (
          <div style={{ color: '#00ffff', marginTop: '5px' }}>
            {regionInfo.poiName
              ? `[${regionInfo.poiName}]`
              : <>
                  {regionInfo.realm}
                  {regionInfo.subRegion && ` - ${regionInfo.subRegion}`}
                </>
            }
          </div>
        )}
      </div>
    </div>
  );
};