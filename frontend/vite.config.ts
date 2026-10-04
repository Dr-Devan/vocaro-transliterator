import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode}) => ({
  plugins: [react()],
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE_PATH || '/',
  test: { include: ['src/**/*.test.ts'] },
}));
