/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@anytime-markdown/editor-core/src/(.*)$": "<rootDir>/../editor-core/src/$1",
    "^@anytime-markdown/editor-core$": "<rootDir>/../editor-core/src/index.ts",
    "^next-auth(.*)$": "<rootDir>/src/__mocks__/next-auth.js",
  },
  maxWorkers: 4,
};

module.exports = config;
