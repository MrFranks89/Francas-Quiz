import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    // civis-ui usa Jest con il preset di React Native (vedi
    // packages/civis-ui/jest.config.js): `npm test` lo lancia dopo Vitest.
    exclude: ['**/node_modules/**', 'packages/civis-ui/**'],
  },
});
