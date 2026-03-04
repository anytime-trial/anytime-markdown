# A1. インラインコメント / 注釈 設計書

日付: 2026-03-04
ステータス: 承認済み

## 背景と目的

AI レビュー結果の記載や、AI 作成の設計書に対するレビュー指摘を AI に伝えるための、インラインコメント機能を実装する。1人用途（著者管理不要）で、AI が Markdown を直接読み書きできる形式で保存する。

## データモデル

```typescript
interface InlineComment {
  id: string;          // nanoid(8)
  text: string;        // コメント本文
  resolved: boolean;   // 解決済みフラグ
  createdAt: string;   // ISO 8601
}
```

## Markdown 保存形式

### 選択コメント（範囲ハイライト）

```markdown
この API は<!-- comment-start:abc12345 -->非推奨<!-- comment-end:abc12345 -->です。
```

### ポイントコメント（カーソル位置）

```markdown
認証方式は OAuth2 を採用。<!-- comment-point:xyz67890 -->
```

### コメントデータ（ドキュメント末尾）

```markdown
<!-- comments
abc12345: v2 への移行を検討すべき
xyz67890: [resolved] JWT も検討したか確認
-->
```

- `[resolved]` プレフィックスで解決済みを表現
- AI が直接読み書きできるプレーンテキスト形式
- 通常の Markdown プレビューでは非表示

## ProseMirror スキーマ

### commentHighlight Mark（選択コメント）

- `name: "commentHighlight"`
- `attrs: { commentId: string }`
- `inclusive: false`（Mark 拡張防止）
- `excludes: ""`（他 Mark と共存可）
- `parseHTML`: `span[data-comment-id]`
- `renderHTML`: `<span data-comment-id="id" class="comment-highlight">`
- serialize: `<!-- comment-start:id -->...<!-- comment-end:id -->`

### commentPoint Node（ポイントコメント）

- `name: "commentPoint"`
- `group: "inline"`, `inline: true`, `atom: true`
- `attrs: { commentId: string }`
- `parseHTML`: `span[data-comment-point]`
- `renderHTML`: `<span data-comment-point="id" class="comment-point-marker">`
- serialize: `<!-- comment-point:id -->`
- NodeView: 小さな吹き出しアイコン

### コメントデータ管理

コメント本文・ステータスは ProseMirror Plugin State で管理。
serialize 時に末尾の `<!-- comments -->` ブロックとして出力、parse 時に読み取り Plugin State へ注入。

## Plugin State

```typescript
interface CommentPluginState {
  comments: Map<string, InlineComment>;
}
```

### コマンド

| コマンド | 動作 |
|---------|------|
| `addComment(text)` | 選択範囲に Mark 付与 or カーソル位置に Point Node 挿入 + コメント追加 |
| `removeComment(id)` | Mark/Node 除去 + コメント削除 |
| `resolveComment(id)` | resolved を true に変更 |
| `unresolveComment(id)` | resolved を false に変更 |
| `updateCommentText(id, text)` | コメント本文を更新 |

### State 更新フロー

```
ユーザー操作 → コマンド → tr.setMeta(commentPluginKey, { action, payload })
→ Plugin.apply() で comments Map 更新 → React 側は useEditorState() で購読・再描画
```

### 孤立コメントクリーンアップ

ドキュメント編集で Mark/Node が消えた場合、appendTransaction で孤立コメントを検出し Plugin State から除去。

## UI 設計

### コメント追加方法

- **BubbleMenu**: テキスト選択時にコメント追加ボタン（吹き出しアイコン）
- **スラッシュコマンド**: `/comment` でポイントコメント挿入
- **ショートカット**: `Ctrl+Shift+M` でコメント追加
- **入力 UI**: MUI Popover でコメント本文入力、Enter で確定

### コメントパネル（右サイドパネル）

```
┌─────────────────────────┐
│ コメント (3/5)    [×]   │  未解決数/全数 + 閉じるボタン
├─────────────────────────┤
│ [フィルタ: 全て ▼]      │  全て / 未解決 / 解決済み
├─────────────────────────┤
│ ┌─ #abc12345 ─────────┐ │
│ │ "非推奨"             │ │  対象テキスト
│ │ v2 への移行を検討す  │ │  コメント本文
│ │ べき                 │ │
│ │ [解決] [削除]        │ │
│ └─────────────────────┘ │
│ ┌─ #xyz67890 ─────────┐ │
│ │ 📌 ポイントコメント   │ │
│ │ JWT も検討したか確認  │ │
│ │ ✓ 解決済み [再開][削除]│ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

- 各カードクリックで該当箇所にスクロール + 選択
- 解決済みコメントはグレーアウト表示

### エディタ内表示

- **選択コメント**: 半透明背景ハイライト（`rgba(255, 200, 0, 0.25)`）。ホバーでツールチップ。解決済みは `rgba(150, 150, 150, 0.15)`。
- **ポイントコメント**: 小さな吹き出しアイコン（NodeView）。解決済みはグレー。

## Markdown パース / シリアライズ

### パース（Markdown → ProseMirror）

1. `<!-- comments ... -->` ブロックを抽出 → コメント Map 生成、本文から除去
2. `<!-- comment-start:id -->` → `<span data-comment-id="id">`、`<!-- comment-end:id -->` → `</span>`
3. `<!-- comment-point:id -->` → `<span data-comment-point="id"></span>`
4. DOMPurify プレースホルダ保護（`\x00CMT...\x00`）
5. editor.onCreate でコメント Map を Plugin State に注入

### シリアライズ（ProseMirror → Markdown）

1. Mark serialize: `<!-- comment-start:id -->...<!-- comment-end:id -->`
2. Node serialize: `<!-- comment-point:id -->`
3. 後処理で末尾に `<!-- comments ... -->` ブロックを付加

## ファイル構成

### 新規ファイル（5ファイル）

| ファイル | 内容 |
|---------|------|
| `extensions/commentExtension.ts` | Mark + Node + Plugin State + コマンド |
| `utils/commentHelpers.ts` | preprocessComments(), appendCommentData() |
| `components/CommentPanel.tsx` | 右サイドパネル |
| `components/CommentPopover.tsx` | コメント入力 Popover |
| `__tests__/comment.test.ts` | テスト |

### 変更ファイル（8ファイル）

| ファイル | 変更内容 |
|---------|---------|
| `editorExtensions.ts` | commentHighlight, commentPoint 登録 |
| `utils/sanitizeMarkdown.ts` | preprocessComments + DOMPurify 保護 |
| `components/EditorBubbleMenu.tsx` | コメント追加ボタン |
| `components/EditorToolbar.tsx` | パネルトグルボタン |
| `extensions/slashCommandItems.ts` | `/comment` コマンド |
| `styles/editorStyles.ts` | コメントスタイル |
| `MarkdownEditorPage.tsx` | CommentPanel 配置 + serialize 後処理 |
| `i18n/en.json`, `ja.json` | コメント関連キー |

## 実装フェーズ

| フェーズ | 内容 | コミット |
|---------|------|---------|
| 1 | commentHelpers（parse/serialize）+ テスト | 1 |
| 2 | commentExtension（Mark + Node + Plugin State + コマンド）+ テスト | 1 |
| 3 | エディタ統合（editorExtensions, sanitizeMarkdown, BubbleMenu, ショートカット） | 1 |
| 4 | CommentPanel + CommentPopover + ツールバー統合 | 1 |
| 5 | スラッシュコマンド + i18n + スタイル仕上げ + 全体検証 | 1 |

## リスク

| リスク | 対策 |
|-------|------|
| DOMPurify が HTML コメント `<!-- -->` を除去する | preprocessComments で HTML タグに変換後、プレースホルダ保護 |
| Mark の範囲がドキュメント編集で崩れる | appendTransaction で孤立コメントを検出・クリーンアップ |
| 大量コメント時のパフォーマンス | Plugin State は Map で O(1) アクセス、パネルは仮想スクロール不要（数十件想定） |
| ソースモード時のコメント表示 | ソースモードでは `<!-- -->` がそのまま表示されるため対応不要 |
