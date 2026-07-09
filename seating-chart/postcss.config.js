import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Point Tailwind at its config explicitly. The plugin otherwise resolves
// tailwind.config.js from the process CWD, which breaks when Vite is run
// from outside seating-chart/ (e.g. `vite seating-chart` at the repo root).
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
