import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        exclude: ['out/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'lcov'],
            reportsDirectory: 'coverage',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts', 'out/**', 'node_modules/**'],
            thresholds: {
                'src/core/merge/**': {
                    lines: 70,
                    functions: 70,
                    branches: 70,
                    statements: 70,
                },
                'src/core/git/**': {
                    lines: 70,
                    functions: 70,
                    branches: 70,
                    statements: 70,
                },
            },
        },
    },
});
