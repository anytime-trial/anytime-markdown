# テストカバレッジ拡大 - 設計書

## 概要

UIコンポーネント4件と未テストhook 2件のテストを追加し、リグレッション防止を強化する。

## 方針

@testing-library/react + user-event によるレンダリング + インタラクションテスト。hook は renderHook で単体テスト。

## テスト対象と観点

| 対象 | テスト観点 |
|------|-----------|
| EditorToolbar | ボタン表示条件、クリックコールバック、ファイル操作ボタン表示 |
| StatusBar | 行番号・文字数表示、ファイル名、dirty インジケータ |
| OutlinePanel | 見出しリスト表示、クリックコールバック、fold/unfold |
| SearchReplaceBar | 検索入力、置換ボタン、マッチ数表示、トグル状態 |
| useEditorFileOps | open/save/saveAs コールバック、未保存確認 |
| useOutline | 見出し管理、折りたたみ状態 |

## テスト方針

- useTranslations は jest.mock でキーをそのまま返す
- Tiptap editor はモック
- 必要な props のみ渡し、未使用はスタブ

## 新規ファイル

| ファイル | 内容 |
|---------|------|
| `editor-core/src/__tests__/EditorToolbar.test.tsx` | ツールバーUIテスト |
| `editor-core/src/__tests__/StatusBar.test.tsx` | ステータスバーUIテスト |
| `editor-core/src/__tests__/OutlinePanel.test.tsx` | アウトラインUIテスト |
| `editor-core/src/__tests__/SearchReplaceBar.test.tsx` | 検索バーUIテスト |
| `editor-core/src/__tests__/useEditorFileOps.test.ts` | ファイル操作hookテスト |
| `editor-core/src/__tests__/useOutline.test.ts` | アウトラインhookテスト |
