/**
 * vscode 非依存の純粋ロジック（noteGraph のフロントマター解析・skillInstaller 等）専用の jest 設定。
 * 拡張本体（vscode API 依存）は vscode-test で別途検証する。
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/noteGraph/__tests__/**/*.test.ts',
    '**/claude/__tests__/**/*.test.ts',
    '**/webview/__tests__/**/*.test.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
