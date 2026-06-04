// Self-contained Jest config for Stryker runs.
// Stryker copies the package into a sandbox dir, which breaks the relative
// `require('../../jest.config.base')` used by the normal jest.config.js.
// This config inlines the needed settings and drops `collectCoverage`
// (Stryker performs its own per-test coverage analysis).
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
