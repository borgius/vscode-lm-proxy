import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    globals: false,
    environment: 'node',
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'out/', 'src/test/'],
    },
  },
})
