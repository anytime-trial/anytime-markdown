/** @type {import('jest').Config} */
module.exports = {
  coverageReporters: ["json", "text", "lcov", "clover", "json-summary"],
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};
