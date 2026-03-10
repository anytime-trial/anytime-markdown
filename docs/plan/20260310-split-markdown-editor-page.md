# MarkdownEditorPage 分割計画

更新日: 2026-03-10


## 目的

`MarkdownEditorPage.tsx`（869行）を400行以下に分割する。\
CodeReview Consultant レポートの改善C。


## 現状分析

| セクション | 行範囲 | 行数 | 内容 |
| --- | --- | --- | --- |
| インポート | 1-92 | 92 | 30+モジュールのインポート |
| Props定義 | 94-118 | 25 | `MarkdownEditorPageProps` |
| 初期化・hooks | 120-525 | 406 | 20+のhooks呼び出し、コールバック、effects |
| ローディング | 527-533 | 7 | スピナー表示 |
| JSXレンダリング | 535-868 | 334 | ツールバー、エディタレイアウト、ダイアログ等 |


## 抽出計画

### Hook 1: `useVSCodeIntegration`（66行削減）

- **対象**: 407-472行目
- **内容**: VS Code TreeViewからの4種イベントリスナー
  - `vscode-scroll-to-heading`
  - `vscode-scroll-to-comment`
  - `vscode-resolve-comment` / `vscode-unresolve-comment` / `vscode-delete-comment`
  - `vscode-toggle-section-numbers`
- **引数**: `editor`, `updateSettings`
- **戻り値**: なし（純粋な副作用）
- **選択理由**: 外部連携ロジックが完全に独立しており、他の状態に依存しない

### Hook 2: `useEditorCommentNotifications`（46行削減）

- **対象**: 327-372行目
- **内容**: コメント変更のデバウンス付き通知
  - `onCommentsChangeRef` の管理
  - `commentsDebounceRef` の管理
  - editor updateイベントでのコメントデータ抽出・通知
- **引数**: `editor`, `onCommentsChange`
- **戻り値**: なし（副作用のみ）
- **選択理由**: コメント通知ロジックは自己完結しており、外部への通知のみを担当

### Hook 3: `useEditorFileHandling`（58行削減）

- **対象**: 137行, 259-316行目
- **内容**: ファイルエンコーディング・改行コード・frontmatter変更ハンドラ
  - `encoding` state
  - `handleLineEndingChange`
  - `handleEncodingChange`
  - `handleFrontmatterChange`
- **引数**: `editor`, `sourceMode`, `sourceText`, `handleSourceChange`, `setSourceText`, `saveContent`, `fileHandle`, `frontmatterRef`
- **戻り値**: `{ encoding, setEncoding, handleLineEndingChange, handleEncodingChange, frontmatterText, setFrontmatterText, handleFrontmatterChange }`
- **選択理由**: ファイル形式関連のハンドラが論理的にまとまっている

### Component 1: `EditorMainContent`（105行削減）

- **対象**: 694-800行目
- **内容**: マージモード / 通常モードのレイアウト切替
  - `InlineMergeView` + `MergeEditorPanel`（マージモード）
  - `SourceModeEditor` + `SourceSearchBar`（ソースモード）
  - WYSIWYG Paper + `SearchReplaceBar` + `FrontmatterBlock`（WYSIWYGモード）
  - `CommentPanel`
  - `EditorOutlineSection`
- **Props**: レイアウトに必要な状態とハンドラ
- **選択理由**: レンダリングの最大ブロックであり、3つのモード分岐を持つ

### Component 2: `EditorFooterOverlays`（65行削減）

- **対象**: 802-863行目
- **内容**: エディタ下部のオーバーレイ群
  - `EditorContent` ポータル
  - `EditorBubbleMenu`
  - `SlashCommandMenu`
  - `StatusBar`
  - `EditorMenuPopovers`
  - PDF `Backdrop`
  - 通知 `Snackbar`
- **Props**: `editor`, 各メニュー状態、ハンドラ
- **選択理由**: 独立したオーバーレイ群で、メインレイアウトと疎結合


## 削減見積

| 抽出 | 削減行数 | 累計残行数 |
| --- | --- | --- |
| 元ファイル | - | 869 |
| `useVSCodeIntegration` | -66 | 803 |
| `useEditorCommentNotifications` | -46 | 757 |
| `useEditorFileHandling` | -58 | 699 |
| `EditorMainContent` | -105 | 594 |
| `EditorFooterOverlays` | -65 | 529 |
| インポート整理 | -30 | 499 |
| ref更新統合 | -15 | 484 |

> 484行の見積。\
> 目標400行には84行不足するが、さらなる分割はhook間の依存が増し複雑化するため、この段階で止める。\
> 追加で `EditorToolbar` のprops組み立て（48行）を別ファイルに移す場合は約436行まで縮小可能。


## 実装順序

1. `useVSCodeIntegration` hook作成 → 型チェック
2. `useEditorCommentNotifications` hook作成 → 型チェック
3. `useEditorFileHandling` hook作成 → 型チェック
4. `EditorMainContent` コンポーネント作成 → 型チェック
5. `EditorFooterOverlays` コンポーネント作成 → 型チェック
6. インポート整理・不要コード削除 → 型チェック → テスト実行


## リスク

- **ref更新タイミング**: `setHeadingsRef.current` 等のref代入がhook間で分散すると、更新順序に依存するバグが生じる可能性がある。\
  ref更新は `MarkdownEditorPage` 本体に残す。
- **再レンダリング**: コンポーネント分割によりprops経由の再レンダリングが増加する可能性がある。\
  `React.memo` は必要に応じて適用。
