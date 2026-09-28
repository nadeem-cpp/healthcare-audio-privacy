import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: [
      'onnxruntime-web',
      '@huggingface/transformers',
      '@ricky0123/vad-web',
    ],
  },
  assetsInclude: ['**/*.onnx', '**/*.wasm'],
})
