# S3 Markdown ドキュメントビューア 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** S3 に保存された Markdown ファイルを一覧・閲覧できるページを web-app に追加する。\

**Architecture:** Next.js サーバーサイド（Route Handler）から AWS SDK で S3 に直接アクセス。\
`/api/docs` で S3 ListObjects、`/api/docs/content` で S3 GetObject を実行。\
ファイル選択で `/docs/view?key=<S3-key>` に遷移し、`MarkdownEditorPage` を読み取り専用モードで表示。\
`MarkdownEditorPage` に `externalContent` + `readOnly` props を追加して実現する。\

**Tech Stack:** Next.js 15 (App Router), AWS SDK v3, editor-core (Tiptap), MUI 7, next-intl

---


## Task 1: `@aws-sdk/client-s3` パッケージの追加


### Files

- Modify: `packages/web-app/package.json`

### Step 1: パッケージをインストール

```bash
cd packages/web-app
npm install @aws-sdk/client-s3@3.787.0
```


### Step 2: 環境変数の定義

`packages/web-app/.env.local` に以下を設定（値はユーザーが設定）:

```
ANYTIME_AWS_REGION=ap-northeast-1
ANYTIME_AWS_ACCESS_KEY_ID=<your-access-key>
ANYTIME_AWS_SECRET_ACCESS_KEY=<your-secret-key>
S3_DOCS_BUCKET=<your-bucket-name>
S3_DOCS_PREFIX=docs/
```

> これらはサーバーサイド専用のため `NEXT_PUBLIC_` プレフィックスは不要。\


### Step 3: コミット

```bash
git add packages/web-app/package.json package-lock.json
git commit -m "feat: @aws-sdk/client-s3 を web-app に追加"
```

---


## Task 2: S3 アクセス用 Route Handler の作成


### Files

- Create: `packages/web-app/src/lib/s3Client.ts`
- Create: `packages/web-app/src/app/api/docs/route.ts`
- Create: `packages/web-app/src/app/api/docs/content/route.ts`

### Step 1: S3 クライアントの共通モジュールを作成

`packages/web-app/src/lib/s3Client.ts`:

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
});

export const DOCS_BUCKET = process.env.S3_DOCS_BUCKET ?? '';
export const DOCS_PREFIX = process.env.S3_DOCS_PREFIX ?? 'docs/';
```


### Step 2: ファイル一覧 API を作成

`packages/web-app/src/app/api/docs/route.ts`:

- `GET /api/docs` で `ListObjectsV2Command` を実行
- `S3_DOCS_PREFIX` 配下の `.md` ファイルをフィルタ
- レスポンス: `{ files: { key: string; name: string; lastModified: string; size: number }[] }`
- バケット未設定時は 500 エラーを返す


### Step 3: ファイル取得 API を作成

`packages/web-app/src/app/api/docs/content/route.ts`:

- `GET /api/docs/content?key=<S3-key>` で `GetObjectCommand` を実行
- クエリパラメータ `key` が `S3_DOCS_PREFIX` で始まることを検証（パストラバーサル防止）
- `.md` 拡張子であることを検証
- レスポンス: `text/markdown; charset=utf-8` で md テキストを返す
- key 未指定・不正時は 400、オブジェクト未存在時は 404 を返す


### Step 4: コミット

```bash
git add packages/web-app/src/lib/s3Client.ts packages/web-app/src/app/api/docs/
git commit -m "feat: S3 アクセス用 Route Handler を作成"
```

---


## Task 3: `MarkdownEditorPage` に `externalContent` / `readOnly` props を追加


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


## Task 4: i18n キーの追加


### Files

- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

### Step 1: Landing セクションにキーを追加

i18n キーは既に追加済み。\
以下のキーが存在することを確認:

```json
"docsPage", "docsDescription", "docsLoadError",
"docsEmpty", "docsViewLoadError", "docsViewNoUrl"
```

既に追加済みの場合はスキップ。\


### Step 2: コミット（変更がある場合のみ）

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "feat: ドキュメントページ用の i18n キーを追加"
```

---


## Task 5: `/docs` 一覧ページの作成


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

- `useEffect` で `/api/docs` を fetch し、ファイル一覧を取得
- レスポンス形式: `{ files: { key: string; name: string; lastModified: string; size: number }[] }`
- 各ファイルを `List` + `ListItemButton` で表示（ファイル名、更新日時）
- クリックで `/docs/view?key=<encoded-key>` に遷移
- `LandingHeader` + `SiteFooter` で囲む
- ローディング、エラー、空リストの状態を表示


### Step 3: 動作確認

`/docs` にアクセスし、S3 が未設定の場合にエラーメッセージが表示されることを確認。\


### Step 4: コミット

```bash
git add packages/web-app/src/app/docs/
git commit -m "feat: /docs ファイル一覧ページを作成"
```

---


## Task 6: `/docs/view` 表示ページの作成


### Files

- Create: `packages/web-app/src/app/docs/view/page.tsx`

### Step 1: `page.tsx` を作成

- クエリパラメータ `key` から S3 キーを取得
- `useEffect` で `/api/docs/content?key=<encoded-key>` を fetch し md テキストを取得
- 取得した md を `MarkdownEditorPage` の `externalContent` に渡す
- `readOnly={true}` を設定
- key 未指定時、fetch エラー時のフォールバック表示
- 戻るリンク（`/docs` へ）を表示


### Step 2: 動作確認

S3 にテスト用 md ファイルを配置し、`/docs/view?key=docs/test.md` でビューア表示を確認。\


### Step 3: コミット

```bash
git add packages/web-app/src/app/docs/view/
git commit -m "feat: /docs/view Markdown ビューアページを作成"
```

---


## Task 7: ナビゲーション統合


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


## Task 8: 結合確認


### Step 1: ビルド確認

```bash
cd packages/web-app && npm run build
```


### Step 2: 全体動線の確認

1. ランディングページ → ヘッダーの Docs → `/docs` 一覧ページ
2. ファイルクリック → `/docs/view?key=...` でビューア表示
3. ビューアが読み取り専用であること
4. `/markdown` エディタが従来通り動作すること
