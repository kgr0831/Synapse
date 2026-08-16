import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(p, import.meta.url))

export default {
  root: 'web',
  publicDir: '../brand',
  server: { port: 5173 },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: at('web/index.html'),
        statusWebgpu: at('web/status/webgpu/index.html')
      }
    }
  }
}
