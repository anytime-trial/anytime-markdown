const base = require('../../jest.config.base');

/**
 * host / webview の 2 プロジェクトへ分ける。
 *
 * Why not: 単一プロジェクトで `tsconfig.test.json` に DOM lib を足す構成にしない。
 * このパッケージは `isolatedModules` 未設定のため ts-jest が実際に型検査しており、
 * webpack の ts-loader は両バンドルとも `transpileOnly: true`、専用の tsc スクリプトも無い。
 * つまり **拡張ホスト側コードの唯一の型検査ゲートが ts-jest** である。ここに DOM を足すと、
 * extension host が誤って window / document を参照しても型エラーにならず、実行時の
 * ReferenceError になって初めて表面化する。
 *
 * 拡張子（.ts / .tsx）での transform 分けでは解決しない。ts-jest は import 元のプログラムで
 * 型検査するため、host 側の .ts テストが tickets-viewer の .tsx を引き込むと host の
 * tsconfig（DOM 無し）で .tsx が検査されて落ちる。テストファイルの所在で分ける必要がある。
 */
const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'cjs', 'json'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts',
    // next-intl は ESM 専用（package.json の exports に require 条件が無い）。
    // tickets-viewer のバレル経由で読み込むと jest が SyntaxError で落ちるため、
    // webpack の alias / tsconfig の paths と同じ shim へ向ける。3 箇所を同期させること。
    '^next-intl$': '<rootDir>/src/webview/shims/next-intl.ts',
    '^next-intl/server$': '<rootDir>/src/webview/shims/next-intl.ts',
    '^@anytime-markdown/tickets-core$': '<rootDir>/../tickets-core/src/index.ts',
  },
};

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  projects: [
    {
      ...shared,
      displayName: 'host',
      // skills/ 配下の同梱スクリプト(.cjs)は拡張本体にバンドルされず、ユーザーの
      // ワークスペースへ素のまま展開されて node 単体で実行される。テストも .cjs で書き、
      // ここで拾わないとゲート対象外の孤児テストになる(codex-review.test.cjs の前例)。
      roots: ['<rootDir>/src', '<rootDir>/skills'],
      testMatch: ['**/__tests__/**/*.test.ts', '**/skills/**/*.test.cjs'],
      // webview 側は下の project が担当する（DOM / jsx を要するため）。
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/webview/'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
      },
    },
    {
      ...shared,
      displayName: 'webview',
      roots: ['<rootDir>/src/webview'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.webview.json' }],
      },
    },
  ],
};
