const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  // skills/ 配下の同梱スクリプト(.cjs)は拡張本体にバンドルされず、ユーザーの
  // ワークスペースへ素のまま展開されて node 単体で実行される。テストも .cjs で書き、
  // ここで拾わないとゲート対象外の孤児テストになる(codex-review.test.cjs の前例)。
  roots: ['<rootDir>/src', '<rootDir>/skills'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/skills/**/*.test.cjs'],
  moduleFileExtensions: ['ts', 'js', 'cjs', 'json'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'CommonJS',
      },
    },
  },
};
