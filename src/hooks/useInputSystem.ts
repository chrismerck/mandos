import { useInput } from 'ink';
import { InputSystem } from '../systems/InputSystem.js';

// React hook to connect ink input to our InputSystem
export function useInputSystem(inputSystem: InputSystem) {
  useInput((input: string, key: any) => {
    if (key.upArrow || input === 'k') {
      inputSystem.setDirection('up');
    } else if (key.downArrow || input === 'j') {
      inputSystem.setDirection('down');
    } else if (key.leftArrow || input === 'h') {
      inputSystem.setDirection('left');
    } else if (key.rightArrow || input === 'l') {
      inputSystem.setDirection('right');
    }
  });
}