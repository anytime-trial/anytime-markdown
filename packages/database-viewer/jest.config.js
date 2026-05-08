const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testEnvironment: 'jsdom',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/__tests__/**/*.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^@anytime-markdown/spreadsheet-core$': '<rootDir>/../spreadsheet-core/src/index.ts',
    '^@anytime-markdown/spreadsheet-viewer$': '<rootDir>/../spreadsheet-viewer/src/index.ts',
    '^@anytime-markdown/database-core$': '<rootDir>/../database-core/src/index.ts',
  },
};
