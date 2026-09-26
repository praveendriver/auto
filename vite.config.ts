import { defineConfig } from 'vite';

export default defineConfig({
  /**
   * GitHub Pages serves a project site from /<repo>/, so built asset URLs
   * need that prefix. Overridable for any host that serves from the root:
   *   BASE_PATH=/ npm run build
   */
  base: process.env.BASE_PATH ?? '/auto/',
  // Own port so it can run beside babu.
  server: { port: 5174, strictPort: true },
});
