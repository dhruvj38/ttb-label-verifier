import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const repositoryName = 'ttb-label-verifier'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${repositoryName}/` : '/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: 'ocr',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
          dest: 'ocr',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm',
          dest: 'ocr',
        },
        {
          src: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
          dest: 'ocr',
        },
      ],
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: true,
  },
}))
