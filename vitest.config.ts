import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/ui/**', 'src/extension.ts', 'src/config/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
