import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Hashed file names under /assets -> CloudFront can cache them for a year (immutable).
    assetsDir: 'assets',
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
});
