import { InputSystem } from '../InputSystem.js';
import { World } from '../../ecs/World.js';

describe('InputSystem', () => {
  let inputSystem: InputSystem;
  let world: World;

  beforeEach(() => {
    inputSystem = new InputSystem();
    world = new World();
  });

  test('should set and get direction', () => {
    expect(inputSystem.getDirection()).toBeNull();

    inputSystem.setDirection('up');
    expect(inputSystem.getDirection()).toBe('up');

    inputSystem.setDirection('down');
    expect(inputSystem.getDirection()).toBe('down');
  });

  test('should consume direction', () => {
    inputSystem.setDirection('left');
    
    const direction = inputSystem.consumeDirection();
    expect(direction).toBe('left');
    
    // After consuming, direction should still be available until update
    expect(inputSystem.getDirection()).toBe('left');
  });

  test('should clear direction after update when consumed', () => {
    inputSystem.setDirection('right');
    inputSystem.consumeDirection();
    
    inputSystem.update(world, 16);
    
    expect(inputSystem.getDirection()).toBeNull();
  });

  test('should not clear direction if not consumed', () => {
    inputSystem.setDirection('up');
    
    inputSystem.update(world, 16);
    
    expect(inputSystem.getDirection()).toBe('up');
  });
});