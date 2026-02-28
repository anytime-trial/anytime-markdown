# CI にテスト実行を追加

## ステータス: 完了

## 意図（なぜ必要か）

editor-core に6つのテストファイル（84テスト）が存在するが、Jest の設定・依存関係が未整備で実行できず、CI にもテストステップがなかった。回帰検知ができない状態を解消する。

## 選択理由

- **Jest + ts-jest**: テストファイルが既に Jest API（describe/test/expect）で記述済みのため、そのまま活用
- **jest-environment-jsdom**: Tiptap エディタが DOM を必要とするため jsdom 環境を使用
- **CI への統合**: 既存の publish ワークフローの Type check 直後に追加し、テスト失敗時はリリースを止める

## 変更ファイル

| # | ファイル | 変更 |
|---|---------|------|
| 1 | `packages/editor-core/package.json` | `test` スクリプト追加、Jest 関連 devDependencies 追加 |
| 2 | `packages/editor-core/jest.config.ts` | **新規** Jest 設定（ts-jest + jsdom） |
| 3 | `packages/editor-core/src/__tests__/useMarkdownEditor.test.ts` | 削除済みプロパティ（lastSavedAt, saveError）参照を除去 |
| 4 | `.github/workflows/publish-vscode-extension.yml` | Type check 後に `Run editor-core tests` ステップ追加 |
| 5 | `package-lock.json` | 依存関係追加に伴う自動更新 |

## 検証

| # | 検証項目 | 結果 |
|---|---------|------|
| 1 | `npx tsc --noEmit` | OK |
| 2 | `cd packages/editor-core && npm test` | 6 suites, 84 tests 全パス |
