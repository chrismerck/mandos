# Mandos2 Web Version

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run start:web
   ```

3. Open http://localhost:3000 in your browser

## Building for Production

```bash
npm run build:web
```

The built files will be in the `dist-web` directory.

## Deployment

The web version is automatically deployed to GitHub Pages when you push to the main/master branch.

After deployment, it will be available at: `https://[your-username].github.io/mandos2/`

## Controls

- **Arrow Keys**: Move in 4 directions
- **Numpad 1-9**: Move in 8 directions (including diagonals)
- **Vi Keys (hjklyubn)**: Alternative 8-directional movement
  - h: left, j: down, k: up, l: right
  - y: up-left, u: up-right, b: down-left, n: down-right

## Technical Details

- Uses Canvas 2D for rendering ASCII graphics
- Loads the same binary map data as the terminal version
- Supports viewport resizing based on window size
- 60 FPS game loop using requestAnimationFrame