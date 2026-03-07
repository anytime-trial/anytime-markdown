# カードレイアウトビルダー 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理者がドラッグ&ドロップで md ファイルのカードを配置し、公開ページとして表示する。\

**Architecture:** 編集画面（`/sites/edit`）でカードを配置、S3 に JSON として保存。\
公開ページ（`/sites`）で JSON を読み込みカードをグリッド表示。\
ドラッグ&ドロップは `@dnd-kit` を使用。\

**Tech Stack:** Next.js 15, @dnd-kit/core, @dnd-kit/sortable, AWS SDK v3, MUI 7

---


## Task 1: `@dnd-kit` パッケージのインストール


### Files

- Modify: `packages/web-app/package.json`

### Step 1: パッケージをインストール

```bash
cd packages/web-app
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --save-exact
```


### Step 2: コミット

```bash
git add packages/web-app/package.json package-lock.json
git commit -m "feat: @dnd-kit をインストール"
```

---


## Task 2: レイアウト API の作成


### Files

- Create: `packages/web-app/src/app/api/sites/layout/route.ts`

### Step 1: GET / PUT Route Handler を作成

- `GET /api/sites/layout`: S3 から `_layout.json` を取得。\
  未存在時は `{ "cards": [] }` を返す。\
- `PUT /api/sites/layout`: Basic 認証 → リクエストボディの JSON を S3 に PUT。\
- S3 キー: `S3_DOCS_PREFIX + _layout.json`


### Step 2: コミット

```bash
git add packages/web-app/src/app/api/sites/layout/
git commit -m "feat: レイアウト JSON の GET / PUT API を作成"
```

---


## Task 3: i18n キーの追加


### Files

- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

### Step 1: Landing セクションにキーを追加

```json
// ja.json
"sitesPage": "サイト",
"sitesEdit": "レイアウト編集",
"sitesFileList": "ファイル一覧",
"sitesCardArea": "カード配置エリア",
"sitesSave": "保存",
"sitesSaveSuccess": "レイアウトを保存しました",
"sitesSaveError": "レイアウトの保存に失敗しました",
"sitesLoadError": "レイアウトの読み込みに失敗しました",
"sitesCardTitle": "タイトル",
"sitesCardDescription": "説明文",
"sitesCardThumbnail": "サムネイル URL",
"sitesEmpty": "カードがありません"
```


### Step 2: コミット

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "feat: カードレイアウトビルダー用 i18n キーを追加"
```

---


## Task 4: 公開ページ `/sites` の作成


### Files

- Create: `packages/web-app/src/app/sites/page.tsx`
- Create: `packages/web-app/src/app/sites/SitesBody.tsx`

### Step 1: `page.tsx` を作成（メタデータ + SitesBody）

### Step 2: `SitesBody.tsx` を作成

- `/api/sites/layout` から JSON 取得
- MUI `Card` コンポーネントでグリッド表示
- カードにタイトル、説明文、サムネイル画像を表示
- カードクリックで `/docs/view?key=<docKey>` に遷移
- レスポンシブ: PC 3列、タブレット 2列、モバイル 1列
- `LandingHeader` + `SiteFooter` で囲む


### Step 3: コミット

```bash
git add packages/web-app/src/app/sites/
git commit -m "feat: /sites 公開ページを作成"
```

---


## Task 5: 編集画面 `/sites/edit` の作成


### Files

- Create: `packages/web-app/src/app/sites/edit/page.tsx`
- Create: `packages/web-app/src/app/sites/edit/EditBody.tsx`

### Step 1: `page.tsx` を作成

### Step 2: `EditBody.tsx` を作成

- 左パネル: `/api/docs` からファイル一覧取得、`DndContext` でドラッグ可能なアイテムとして表示
- 右パネル: カード配置エリア、`SortableContext` で並び替え可能
- 左 → 右へのドラッグでカード追加（`docKey`, `title`=ファイル名, `description`="", `thumbnail`=""）
- 右パネル内のドラッグで並び替え
- カードクリックでインライン編集ダイアログ（タイトル、説明文、サムネイル URL）
- カード削除ボタン
- 保存ボタン: `PUT /api/sites/layout` に JSON を送信（Basic 認証）
- `LandingHeader` + `SiteFooter` で囲む


### Step 3: コミット

```bash
git add packages/web-app/src/app/sites/edit/
git commit -m "feat: /sites/edit レイアウト編集画面を作成"
```

---


## Task 6: ナビゲーション統合


### Files

- Modify: `packages/web-app/src/app/components/LandingHeader.tsx`
- Modify: `packages/web-app/src/app/components/SiteFooter.tsx`

### Step 1: ヘッダー・フッターに `/sites` リンクを追加


### Step 2: コミット

```bash
git add packages/web-app/src/app/components/LandingHeader.tsx packages/web-app/src/app/components/SiteFooter.tsx
git commit -m "feat: ヘッダー・フッターに Sites リンクを追加"
```

---


## Task 7: 結合確認


### Step 1: ビルド確認

```bash
cd packages/web-app && npm run build
```


### Step 2: 動作確認

1. `/sites/edit` でファイル一覧からカードをドラッグ&ドロップ
2. カードのタイトル・説明文・サムネイルを編集
3. 保存ボタンで S3 に JSON 保存
4. `/sites` でカードがグリッド表示される
5. カードクリックで `/docs/view?key=...` に遷移
