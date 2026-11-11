import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.js', 'server/test/**/*.test.js'],
    environment: 'node',
  },
});
