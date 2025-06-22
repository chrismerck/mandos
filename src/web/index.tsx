import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebGame } from './WebGame.js';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <WebGame mapFile="middle_earth.worldmap" />
  </React.StrictMode>
);