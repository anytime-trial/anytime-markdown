// Self-contained Jest config for Stryker runs (calibration).
// Stryker copies the package into a sandbox dir, which breaks the relative
// `require('../../jest.config.base')` used by the normal jest.config.js.
// Scoped to the heuristic.test.ts <-> heuristic.ts pair for calibration.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/heuristic.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
