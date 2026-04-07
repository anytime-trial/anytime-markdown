/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  maxWorkers: 1,
};

module.exports = config;
