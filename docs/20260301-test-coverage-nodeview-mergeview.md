# L-08: テストカバレッジ拡充（NodeView系、MergeView）

## Status: COMPLETED

## 実装サマリ

6つのテストファイルを新規作成し、合計 50 テストケースを追加。

### 作成ファイル

| # | テストファイル | テスト数 | 対象 |
|---|--------------|---------|------|
| 1 | `useDiffBackground.test.ts` | 9 | gradient生成、sourceMode切替、RLE圧縮 |
| 2 | `useMergeMode.test.ts` | 11 | handleMerge toggle、Effect、vscodeイベント、auto-close |
| 3 | `useCodeBlockAutoCollapse.test.ts` | 13 | mermaid/plantuml折りたたみ、update listener、cleanup |
| 4 | `useDiffHighlight.test.ts` | 8 | computeBlockDiff連携、clearDiffHighlight、lifecycle |
| 5 | `DetailsNodeView.test.tsx` | 9 | open/close toggle、Enter/Space キーボード操作、aria属性 |
| 6 | `ImageNodeView.test.tsx` | 17 | toolbar表示条件、delete dialog、fullscreen、resize handle |

### 検証結果

- `npx tsc --noEmit`: 通過
- `npx jest --no-coverage`: 25 suites, 324 tests, 全合格

### 設計判断

- `@testing-library/jest-dom` が未導入のため、`getAttribute()` パターンで DOM属性を検証（既存テスト規約に準拠）
- `createMockEditor()` は各テストファイルにローカル定義（既存パターンに準拠、共通helperの新規作成なし）
- MUI Dialog のアニメーション遷移があるため、cancel テストは `editor.chain` 未呼び出しで検証
- `mockFn()` ヘルパーで型キャスト問題を回避（`as unknown as jest.Mock` のネスト回避）
