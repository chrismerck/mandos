import { useStdout } from 'ink';
import { useState, useEffect } from 'react';

export interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24
  });

  useEffect(() => {
    const updateSize = () => {
      setSize({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24
      });
    };

    // Update on mount
    updateSize();

    // Listen for resize events
    stdout.on('resize', updateSize);

    return () => {
      stdout.off('resize', updateSize);
    };
  }, [stdout]);

  return size;
}