# Annotra frontend

Next.js app for Annotra: Media library, and annotation editors for images, video, audio, and 3D assets.

### Run

From this directory, after `npm install`:

- **Development**: `npm run dev` — Next.js dev server (default `http://localhost:3000`).
- **Production build**: `npm run build` — creates an optimized build under `.next`.
- **Production serve**: `npm start` — serves the built app (run `build` first).

### Packages used for annotations

- konva ^10.2.5 / react-konva ^19.2.3 — 2D canvas for image and dataset editors  
- three ^0.172.0 — 3D editor (loaders, orbit/transform controls)  
- wavesurfer.js ^7.12.6 — audio waveform and region plugin  
- stats.js — FPS / MS overlay in the 3D editor

## Requirements

- Node.js 20+
- npm 10+

## Tests

Unit and component tests use [Vitest](https://vitest.dev/) - editor flows (image, video, audio, 3D) live under `src/components/annotations/editors/__tests__/`.

```bash
npm run test
```
