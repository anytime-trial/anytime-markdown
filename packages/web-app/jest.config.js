const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "\\.md$": "<rootDir>/src/__mocks__/md-raw.js",
    "^@/(.*)$": "<rootDir>/../markdown-core/src/$1",
    "^@anytime-markdown/markdown-core/src/(.*)$": "<rootDir>/../markdown-core/src/$1",
    "^@anytime-markdown/markdown-core$": "<rootDir>/../markdown-core/src/index.ts",
    "^@anytime-markdown/graph-viewer/src/(.*)$": "<rootDir>/../graph-viewer/src/$1",
    "^@anytime-markdown/graph-viewer$": "<rootDir>/../graph-viewer/src/index.ts",
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
