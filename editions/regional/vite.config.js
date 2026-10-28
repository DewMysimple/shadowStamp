import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Downloads and QA captures are outputs, not HMR inputs. On Windows a
  // browser's temporary download lock can otherwise crash the file watcher.
  server: { watch: { ignored: ['**/artifacts/**'] } },
  build: { rollupOptions: { output: { manualChunks: (id) => id.includes('/node_modules/three/') ? 'three' : undefined } } },
});
