// Self-contained Jest config for Stryker runs (calibration).
// Scoped to the csv.test.ts <-> utils/csv.ts pair.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/csv.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
