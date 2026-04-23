/** @type {import('jest').Config} */
const config = {
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
  },
};

module.exports = config;
