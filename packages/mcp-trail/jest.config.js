const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@anytime-markdown/trail-caravan-book$': '<rootDir>/../trail-caravan-book/src/index.ts',
    // /query サブパスもマップする。バレルだけ張ると node_modules シンボリックリンク経由で
    // main チェックアウト側の実装へ解決され、worktree の変更を見ずにテストが走る。
    '^@anytime-markdown/trail-caravan-book/query$': '<rootDir>/../trail-caravan-book/src/query/index.ts',
    '^@anytime-markdown/markdown-catalog$': '<rootDir>/../markdown-catalog/src/index.ts',
    '^@anytime-markdown/trail-activity$': '<rootDir>/../trail-activity/src/index.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
