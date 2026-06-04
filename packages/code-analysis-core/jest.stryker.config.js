// Self-contained Jest config for Stryker runs (calibration).
// Scoped to the ImportanceScorer.test.ts <-> importance/ImportanceScorer.ts pair.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/ImportanceScorer.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
