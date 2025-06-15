import { useInput } from 'ink';
import { InputSystem } from '../systems/InputSystem.js';

// React hook to connect ink input to our InputSystem
export function useInputSystem(inputSystem: InputSystem) {
  useInput((input: string, key: any) => {
    // Arrow keys
    if (key.upArrow) {
      inputSystem.setDirection('up');
    } else if (key.downArrow) {
      inputSystem.setDirection('down');
    } else if (key.leftArrow) {
      inputSystem.setDirection('left');
    } else if (key.rightArrow) {
      inputSystem.setDirection('right');
    }
    // Vi keys (hjkl) for cardinal directions
    else if (input === 'k' || input === '8') {
      inputSystem.setDirection('up');
    } else if (input === 'j' || input === '2') {
      inputSystem.setDirection('down');
    } else if (input === 'h' || input === '4') {
      inputSystem.setDirection('left');
    } else if (input === 'l' || input === '6') {
      inputSystem.setDirection('right');
    }
    // Diagonal movements (numpad style and vi-keys)
    else if (input === '7' || input === 'y') {
      inputSystem.setDirection('up-left');
    } else if (input === '9' || input === 'u') {
      inputSystem.setDirection('up-right');
    } else if (input === '1' || input === 'b') {
      inputSystem.setDirection('down-left');
    } else if (input === '3' || input === 'n') {
      inputSystem.setDirection('down-right');
    }
  });
}