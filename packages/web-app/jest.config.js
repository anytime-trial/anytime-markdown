/** @type {import('jest').Config} */
const config = {
  coverageReporters: ["json", "text", "lcov", "clover", "json-summary"],
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@anytime-markdown/markdown-core/src/(.*)$": "<rootDir>/../markdown-core/src/$1",
    "^@anytime-markdown/markdown-core$": "<rootDir>/../markdown-core/src/index.ts",
    "^next-auth/providers/(.*)$": "<rootDir>/src/__mocks__/next-auth-provider.js",
    "^next-auth(.*)$": "<rootDir>/src/__mocks__/next-auth.js",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/__mocks__/**",
    "!src/i18n/**",
    "!src/types/**",
    "!src/app/**/page.tsx",
    "!src/app/**/layout.tsx",
    "!src/app/sw.ts",
  ],
};

module.exports = config;
