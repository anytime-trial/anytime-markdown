const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/skills'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/*.meta.test.ts', '**/skills/**/*.test.cjs'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    // ビルド成果物 (out/) ではなくソースを直接見る（graph 拡張と同じ方針）。
    '^@anytime-markdown/vscode-common$': '<rootDir>/../vscode-common/src/index.ts',
    '^@anytime-markdown/agent-core$': '<rootDir>/../agent-core/src/index.ts',
    '^@anytime-markdown/trail-caravan-book$': '<rootDir>/../trail-caravan-book/src/index.ts',
    '^@anytime-markdown/trail-caravan-book/pipeline$': '<rootDir>/../trail-caravan-book/src/pipeline-exports.ts',
  },
  maxWorkers: 1,
  // 保護領域（~/.claude, ~/.vscode-server）への書き込みを全テストで禁止する
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
};
