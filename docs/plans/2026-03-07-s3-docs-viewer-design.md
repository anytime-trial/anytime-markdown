# S3 Markdown ドキュメントビューア 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** S3 に保存された Markdown ファイルを一覧・閲覧できるページを web-app に追加する。\

**Architecture:** ファイル一覧 API からファイルリストを取得し `/docs` に表示。\
ファイル選択で `/docs/view?url=<S3-URL>` に遷移し、`MarkdownEditorPage` を読み取り専用モードで表示。\
`MarkdownEditorPage` に `externalContent` + `readOnly` props を追加して実現する。\

**Tech Stack:** Next.js 15 (App Router), editor-core (Tiptap), MUI 7, next-intl

---


## Task 1: `MarkdownEditorPage` に `externalContent` / `readOnly` props を追加


### Files

- Modify: `packages/editor-core/src/MarkdownEditorPage.tsx:75-101`

### Step 1: props 定義を拡張

`MarkdownEditorPageProps` に以下を追加:

```typescript
externalContent?: string;  // 外部から注入するコンテンツ（指定時は localStorage を使わない）
readOnly?: boolean;         // true で viewMode を強制し編集不可にする
```


### Step 2: `useMarkdownEditor` の呼び出しを条件分岐

`externalContent` が指定された場合は `useMarkdownEditor` の `defaultContent` に `externalContent` を渡す。\
`readOnly` が true の場合は `saveContent` を no-op に差し替える。\

```typescript
const noopSave = useCallback(() => {}, []);
const {
  initialContent,
  loading,
  saveContent: _saveContent,
  downloadMarkdown,
  clearContent,
} = useMarkdownEditor(externalContent ?? defaultContent);
const saveContent = readOnly ? noopSave : _saveContent;
```


### Step 3: `readOnly` 時に viewMode を強制

`useSourceMode` の初期化後、`readOnly` が true の場合にエディタを `setEditable(false)` にする。\
既存の `viewMode` の仕組みを利用する。\

```typescript
useEffect(() => {
  if (readOnly && editor) {
    editor.setEditable(false);
  }
}, [readOnly, editor]);
```


### Step 4: `readOnly` 時の UI 制御

`readOnly` が true の場合、以下の props を自動的に有効化:

- `hideFileOps`
- `hideUndoRedo`

ツールバーのモード切替（ソース/WYSIWYG/ビュー）も非表示にする。\


### Step 5: 動作確認

`/markdown` ページが従来通り動作することを確認。\


### Step 6: コミット

```bash
git add packages/editor-core/src/MarkdownEditorPage.tsx
git commit -m "feat: MarkdownEditorPage に externalContent / readOnly props を追加"
```

---


## Task 2: i18n キーの追加


### Files

- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

### Step 1: Landing セクションにキーを追加

```json
// ja.json の Landing セクション
"docsPage": "ドキュメント",
"docsDescription": "公開ドキュメントの一覧",
"docsLoadError": "ドキュメント一覧の読み込みに失敗しました",
"docsEmpty": "ドキュメントがありません",
"docsViewLoadError": "ドキュメントの読み込みに失敗しました",
"docsViewNoUrl": "表示するドキュメントが指定されていません"
```

```json
// en.json の Landing セクション
"docsPage": "Docs",
"docsDescription": "Public documentation",
"docsLoadError": "Failed to load document list",
"docsEmpty": "No documents available",
"docsViewLoadError": "Failed to load document",
"docsViewNoUrl": "No document specified"
```


### Step 2: コミット

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "feat: ドキュメントページ用の i18n キーを追加"
```

---


## Task 3: `/docs` 一覧ページの作成


### Files

- Create: `packages/web-app/src/app/docs/page.tsx`
- Create: `packages/web-app/src/app/docs/DocsBody.tsx`

### Step 1: `page.tsx` を作成

```typescript
import type { Metadata } from 'next';
import DocsBody from './DocsBody';

export const metadata: Metadata = {
  title: 'Docs - Anytime Markdown',
  description: 'Public documentation for Anytime Markdown',
  alternates: { canonical: '/docs' },
};

export default function DocsPage() {
  return <DocsBody />;
}
```


### Step 2: `DocsBody.tsx` を作成

- 環境変数 `NEXT_PUBLIC_DOCS_API_URL` から API URL を取得
- `useEffect` で API を fetch し、ファイル一覧を取得
- レスポンス形式: `{ name: string; url: string }[]`（暫定）
- 各ファイルを `List` + `ListItemButton` で表示
- クリックで `/docs/view?url=<encoded-url>` に遷移
- `LandingHeader` + `SiteFooter` で囲む
- ローディング、エラー、空リストの状態を表示


### Step 3: 動作確認

`/docs` にアクセスし、API が未設定の場合にエラーメッセージが表示されることを確認。\


### Step 4: コミット

```bash
git add packages/web-app/src/app/docs/
git commit -m "feat: /docs ファイル一覧ページを作成"
```

---


## Task 4: `/docs/view` 表示ページの作成


### Files

- Create: `packages/web-app/src/app/docs/view/page.tsx`

### Step 1: `page.tsx` を作成

- クエリパラメータ `url` から S3 URL を取得
- `useEffect` で S3 URL を直接 fetch し md テキストを取得
- 取得した md を `MarkdownEditorPage` の `externalContent` に渡す
- `readOnly={true}` を設定
- URL 未指定時、fetch エラー時のフォールバック表示


### Step 2: 動作確認

`/docs/view?url=https://example.com/test.md` にアクセスし、md が読み取り専用で表示されることを確認。\


### Step 3: コミット

```bash
git add packages/web-app/src/app/docs/view/
git commit -m "feat: /docs/view Markdown ビューアページを作成"
```

---


## Task 5: ナビゲーション統合


### Files

- Modify: `packages/web-app/src/app/components/LandingHeader.tsx`
- Modify: `packages/web-app/src/app/components/SiteFooter.tsx`

### Step 1: `LandingHeader.tsx` にリンク追加

デスクトップ: Features ボタンの隣に Docs ボタンを追加。\
モバイル Drawer: Features の下に Docs を追加。\


### Step 2: `SiteFooter.tsx` にリンク追加

Features リンクの隣に Docs リンクを追加。\


### Step 3: 動作確認

ランディングページからヘッダー・フッター経由で `/docs` に遷移できることを確認。\


### Step 4: コミット

```bash
git add packages/web-app/src/app/components/LandingHeader.tsx packages/web-app/src/app/components/SiteFooter.tsx
git commit -m "feat: ヘッダー・フッターに Docs リンクを追加"
```

---


## Task 6: 結合確認

### Step 1: ビルド確認

```bash
cd packages/web-app && npm run build
```


### Step 2: 全体動線の確認

1. ランディングページ → ヘッダーの Docs → `/docs` 一覧ページ
2. ファイルクリック → `/docs/view?url=...` でビューア表示
3. ビューアが読み取り専用であること
4. `/markdown` エディタが従来通り動作すること
