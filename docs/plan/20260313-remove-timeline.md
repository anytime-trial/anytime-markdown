# タイムライン機能の完全削除

作成日: 2026-03-13

## 意図

タイムライン再生機能は前セッションで再生アニメーションを削除済みだが、スライダー・差分表示・プロバイダー等の基盤コードが残存している。\
機能全体を削除し、コードベースを簡素化する。

## 削除対象

### ファイル削除 (7ファイル)

| ファイル | 内容 |
| --- | --- |
| `editor-core/src/hooks/useTimeline.ts` | タイムラインフック |
| `editor-core/src/types/timeline.ts` | 型定義 |
| `editor-core/src/components/TimelineBar.tsx` | スライダー UI |
| `editor-core/src/components/TimelineDiffView.tsx` | 差分表示 |
| `editor-core/src/__tests__/useTimeline.test.ts` | テスト |
| `web-app/src/lib/GitHubTimelineProvider.ts` | GitHub プロバイダー |
| `vscode-extension/src/providers/VscodeTimelineProvider.ts` | VSCode プロバイダー |

### ファイル編集 (13ファイル)

| ファイル | 削除内容 |
| --- | --- |
| `editor-core/src/index.ts` | timeline 関連 export 4行 |
| `editor-core/src/types/toolbar.ts` | `isTimelineActive`, `onOpenTimeline` props |
| `editor-core/src/MarkdownEditorPage.tsx` | timeline props, useTimeline, useEffect, state (~45行) |
| `editor-core/src/components/EditorMainContent.tsx` | timeline props, TimelineBar JSX (~8行) |
| `editor-core/src/components/EditorToolbar.tsx` | timeline 状態参照 |
| `editor-core/src/components/EditorToolbarSection.tsx` | timeline props パススルー |
| `web-app/src/app/markdown/page.tsx` | GitHubTimelineProvider, state, handlers (~30行) |
| `web-app/src/components/ExplorerPanel.tsx` | timeline props, コミット履歴 UI |
| `vscode-extension/src/extension.ts` | VscodeTimelineProvider import/setup |
| `vscode-extension/src/webview/App.tsx` | WebviewTimelineProvider class, IPC (~45行) |
| `vscode-extension/src/providers/MarkdownEditorProvider.ts` | timeline property, IPC cases |
| `editor-core/src/i18n/en.json` | timeline 翻訳キー 5件 |
| `editor-core/src/i18n/ja.json` | timeline 翻訳キー 5件 |

## 実行順序

1. editor-core: ファイル削除 → index.ts export 削除 → 型定義 → コンポーネント編集
2. web-app: プロバイダー削除 → page.tsx → ExplorerPanel
3. vscode-extension: プロバイダー削除 → extension.ts → App.tsx → MarkdownEditorProvider
4. i18n キー削除
5. `tsc --noEmit` + `npm run build -w packages/web-app` で検証

## リスク

- ExplorerPanel のコミット履歴表示がタイムラインと密結合している場合、UI 構造の変更が大きくなる可能性
- VSCode 拡張のメッセージハンドラ削除漏れで実行時エラーの可能性
