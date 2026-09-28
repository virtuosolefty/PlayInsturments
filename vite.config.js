import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this project from /PlayInsturments/, while local Vite
// previews are served from /. Keeping the base here makes both links work.
const base = process.env.GITHUB_PAGES === 'true' ? '/PlayInsturments/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Web MIDI requires a secure context. localhost counts as secure, so plain
    // HTTP on localhost is fine. If you want to reach the app from another
    // device on your LAN you must serve it over HTTPS.
    host: 'localhost',
  },
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.{js,jsx}'], maxWorkers: 2, minWorkers: 1, testTimeout: 15000 },
});
