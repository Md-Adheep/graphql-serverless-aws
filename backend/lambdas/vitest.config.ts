import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the esbuild "text" loader used at deploy time so .sql migrations import as strings.
  plugins: [
    {
      name: 'sql-as-text',
      transform(code, id) {
        if (id.endsWith('.sql')) return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    environment: 'node',
  },
});
