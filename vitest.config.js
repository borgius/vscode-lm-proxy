Object.defineProperty(exports, '__esModule', { value: true })
const config_1 = require('vitest/config')
exports.default = (0, config_1.defineConfig)({
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
