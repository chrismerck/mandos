#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Game } from './Game.js';

const { unmount } = render(<Game mapFile="middle_earth.worldmap" />);

process.on('SIGINT', () => {
  unmount();
  process.exit(0);
});