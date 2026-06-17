const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: [
    "<rootDir>/src/__tests__/**/*.test.ts",
    "<rootDir>/src/__tests__/**/*.test.tsx",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  maxWorkers: 1,
  moduleNameMapper: {
    "^@anytime-markdown/spreadsheet-core$": "<rootDir>/../spreadsheet-core/src/index.ts",
    "^@anytime-markdown/chart-core/element$": "<rootDir>/../chart-core/src/element.ts",
    "^@anytime-markdown/chart-core$": "<rootDir>/../chart-core/src/index.ts",
  },
};
module.exports = config;
