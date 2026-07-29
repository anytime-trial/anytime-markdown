const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  maxWorkers: 1,
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    '^@anytime-markdown/tickets-core$': '<rootDir>/../tickets-core/src/index.ts',
    // next-intl は ESM-only（node の "exports" に require 条件を持たない）で jest では
    // そのまま require できない。webpack 側の alias（webpack.config.js の webviewConfig）と
    // 同じ実体（このパッケージの next-intl shim）に差し替える。
    '^next-intl$': '<rootDir>/src/webview/shims/next-intl.ts',
    '^next-intl/server$': '<rootDir>/src/webview/shims/next-intl.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
