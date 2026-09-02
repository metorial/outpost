import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The built page is always served from the proxy's own root ('/'), so the asset base never
// needs to change between dev and build the way a backend-mounted frontend's would.
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5190
  },

  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  }
});
