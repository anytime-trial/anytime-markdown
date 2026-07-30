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
  // tsx は tickets-viewer の React コンポーネント（TicketsPanel.tsx 等）の解決に要る。
  // transform 側は '^.+\\.tsx?$' で既に対応済みだが、拡張子の解決候補に入れないと
  // バレル（src/index.ts）からの `./TicketsPanel` が Cannot find module になる。
  moduleFileExtensions: ['ts', 'tsx', 'js', 'cjs', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    // next-intl は ESM 専用（package.json の exports に require 条件が無い）。
    // tickets-viewer のバレル経由で読み込むと jest が SyntaxError で落ちるため、
    // webpack の alias / tsconfig.webview.json の paths と同じ shim へ向ける。3 箇所を同期させること。
    '^next-intl$': '<rootDir>/src/webview/shims/next-intl.ts',
    '^next-intl/server$': '<rootDir>/src/webview/shims/next-intl.ts',
    '^@anytime-markdown/tickets-core$': '<rootDir>/../tickets-core/src/index.ts',
  },
};
