import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  root: fileURLToPath(new URL('../../frontend', import.meta.url)),
  configFile: false,
  envFile: false,
  base: './',
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4181',
        changeOrigin: true,
      },
    },
  },
});

await server.listen();
console.log('Adaptive page-size Vite server ready on http://127.0.0.1:4174');
