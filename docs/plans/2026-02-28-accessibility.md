# Accessibility Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** WCAG Level A/AA 準拠を目指し、全 UI コンポーネントのアクセシビリティを改善する。

**Architecture:** コンポーネント単位で段階的に改善。ページ構造（ランドマーク）を最初に整備し、各コンポーネントの ARIA 属性・キーボード操作・フォーカス管理を修正。翻訳キーは最初に一括追加。

**Tech Stack:** React, MUI, Tiptap, next-intl (i18n)

---

### Task 1: 翻訳キー追加

**Files:**
- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

**Step 1: ja.json に a11y 用翻訳キーを追加**

以下のキーを追加（既存キーの末尾に追記）:

```json
"textFormatMenu": "テキスト装飾メニュー",
"searchReplace": "検索・置換",
"caseSensitive": "大文字小文字を区別",
"wholeWord": "単語単位で検索",
"regex": "正規表現",
"matchCount": "{{current}} / {{total}} 件",
"noMatches": "一致なし",
"imageToolbar": "画像ツールバー",
"statusBar": "ステータスバー",
"unsavedChanges": "未保存",
"outlineNavigation": "見出しナビゲーション",
"foldAll": "すべて折りたたむ",
"unfoldAll": "すべて展開する",
"settingsPanel": "設定パネル",
"languageSelect": "言語選択",
"tableWidthSelect": "テーブル幅",
"compareMode": "比較モード",
"editMode": "編集モード切替",
"tableOfContents": "目次",
"loadCompareFile": "比較ファイルを読み込む",
"exportCompareFile": "比較ファイルをエクスポート",
"copiedToClipboard": "クリップボードにコピーしました"
```

**Step 2: en.json に同じキーを追加**

```json
"textFormatMenu": "Text formatting menu",
"searchReplace": "Search and replace",
"caseSensitive": "Match case",
"wholeWord": "Match whole word",
"regex": "Use regular expression",
"matchCount": "{{current}} / {{total}} matches",
"noMatches": "No matches",
"imageToolbar": "Image toolbar",
"statusBar": "Status bar",
"unsavedChanges": "Unsaved",
"outlineNavigation": "Heading navigation",
"foldAll": "Fold all",
"unfoldAll": "Unfold all",
"settingsPanel": "Settings panel",
"languageSelect": "Language",
"tableWidthSelect": "Table width",
"compareMode": "Compare mode",
"editMode": "Edit mode toggle",
"tableOfContents": "Table of contents",
"loadCompareFile": "Load compare file",
"exportCompareFile": "Export compare file",
"copiedToClipboard": "Copied to clipboard"
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "a11y: add translation keys for accessibility labels"
```

---

### Task 2: ページ構造・ランドマーク整備

**Files:**
- Modify: `packages/editor-core/src/MarkdownEditorPage.tsx`

**Step 1: main ランドマーク追加**

エディタ領域（OutlinePanel + EditorContent/textarea）を `<Box component="main">` で囲む。

現在のエディタコンテンツ領域（`editorWrapperRef` の親 Box）を `<main>` にする。具体的には、OutlinePanel と EditorContent を含む flex コンテナ Box に `component="main"` を追加。

**Step 2: hidden file input に aria-hidden 追加**

`<input type="file">` に `aria-hidden="true"` と `tabIndex={-1}` を追加。

**Step 3: 型チェック・テスト**

Run: `npx tsc --noEmit && cd packages/editor-core && npm test`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/MarkdownEditorPage.tsx
git commit -m "a11y: add main landmark and hide file input from assistive tech"
```

---

### Task 3: ConfirmDialog のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/providers/ConfirmDialog.tsx`

**Step 1: Dialog に aria-labelledby 追加**

```tsx
<Dialog
  open={open}
  onClose={handleCancel}
  aria-labelledby="confirm-dialog-title"
>
```

**Step 2: DialogTitle に id 追加**

```tsx
<DialogTitle id="confirm-dialog-title">
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/providers/ConfirmDialog.tsx
git commit -m "a11y: add aria-labelledby to ConfirmDialog"
```

---

### Task 4: EditorSettingsPanel のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/EditorSettingsPanel.tsx`

**Step 1: Drawer に aria-labelledby 追加**

```tsx
<Drawer
  anchor="right"
  open={open}
  onClose={onClose}
  aria-labelledby="settings-panel-title"
>
```

**Step 2: タイトル Typography に id 追加**

```tsx
<Typography variant="subtitle1" id="settings-panel-title">
```

**Step 3: ToggleButtonGroup に aria-label 追加**

言語選択:
```tsx
<ToggleButtonGroup
  value={currentLocale}
  exclusive
  onChange={...}
  size="small"
  aria-label={t("languageSelect")}
>
```

テーブル幅選択（存在する場合）:
```tsx
<ToggleButtonGroup
  ...
  aria-label={t("tableWidthSelect")}
>
```

**Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: コミット**

```bash
git add packages/editor-core/src/components/EditorSettingsPanel.tsx
git commit -m "a11y: add ARIA labels to EditorSettingsPanel"
```

---

### Task 5: HelpDialog のフォーカス管理

**Files:**
- Modify: `packages/editor-core/src/components/HelpDialog.tsx`

**Step 1: TOC サイドバーに role と aria-label 追加**

TOC を囲む Box に:
```tsx
<Box role="navigation" aria-label={t("tableOfContents")}>
```

**Step 2: TOC クリック後にフォーカスを見出しへ移動**

既存の `scrollIntoView` 呼び出し箇所で、スクロール後にフォーカスを移動:
```tsx
const el = document.getElementById(id);
if (el) {
  el.scrollIntoView({ behavior: 'smooth' });
  el.setAttribute('tabindex', '-1');
  el.focus();
}
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/HelpDialog.tsx
git commit -m "a11y: add TOC navigation role and focus management to HelpDialog"
```

---

### Task 6: EditorBubbleMenu のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/EditorBubbleMenu.tsx`

**Step 1: Paper コンテナに role="toolbar" と aria-label 追加**

```tsx
<Paper
  role="toolbar"
  aria-label={t("textFormatMenu")}
  ...
>
```

**Step 2: 全 IconButton に aria-label 追加**

各 Tooltip 内の IconButton に明示的な `aria-label` を追加。既存の翻訳キー（`bold`, `italic`, `strikethrough`, `code`, `link` 等）を使用:

```tsx
<IconButton size="small" aria-label={t("bold")} onClick={...}>
```

**Step 3: Arrow キーナビゲーション実装**

EditorToolbar の矢印キーハンドラと同じパターンを実装。Paper に `onKeyDown` ハンドラを追加:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const buttons = Array.from(
    (e.currentTarget as HTMLElement).querySelectorAll('button:not([disabled])')
  ) as HTMLElement[];
  const current = buttons.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowRight'
    ? (current + 1) % buttons.length
    : (current - 1 + buttons.length) % buttons.length;
  buttons[next]?.focus();
};
```

**Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: コミット**

```bash
git add packages/editor-core/src/components/EditorBubbleMenu.tsx
git commit -m "a11y: add toolbar role, ARIA labels, and keyboard nav to BubbleMenu"
```

---

### Task 7: SearchReplaceBar のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/SearchReplaceBar.tsx`

**Step 1: トグルボタンに aria-label 追加**

大文字小文字 (Aa):
```tsx
<IconButton aria-label={t("caseSensitive")} ...>
```

単語単位 (Ab|):
```tsx
<IconButton aria-label={t("wholeWord")} ...>
```

正規表現 (.*):
```tsx
<IconButton aria-label={t("regex")} ...>
```

**Step 2: マッチ数表示に aria-live 追加**

マッチ数を表示する Typography に:
```tsx
<Typography aria-live="polite" aria-atomic="true" ...>
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/SearchReplaceBar.tsx
git commit -m "a11y: add ARIA labels and live region to SearchReplaceBar"
```

---

### Task 8: FsSearchBar のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/FsSearchBar.tsx`

**Step 1: トグルボタンに aria-label 追加**

SearchReplaceBar と同様:
```tsx
<IconButton aria-label={t("caseSensitive")} ...>
```

**Step 2: マッチ数表示に aria-live 追加**

```tsx
<Typography aria-live="polite" aria-atomic="true" ...>
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/FsSearchBar.tsx
git commit -m "a11y: add ARIA labels and live region to FsSearchBar"
```

---

### Task 9: StatusBar のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/StatusBar.tsx`

**Step 1: 外側 Box に role と aria-label 追加**

```tsx
<Box role="contentinfo" aria-label={t("statusBar")} ...>
```

**Step 2: 行番号・文字数領域に aria-live 追加**

行番号・文字数を含む Box に:
```tsx
<Box aria-live="polite" aria-atomic="true">
```

**Step 3: dirty 表示のスクリーンリーダー対応**

ファイル名表示部分で、dirty 時に `aria-label` を設定:
```tsx
<Typography
  aria-label={isDirty ? `${fileName} (${t("unsavedChanges")})` : fileName}
  ...
>
  {fileName}{isDirty ? ' *' : ''}
</Typography>
```

**Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: コミット**

```bash
git add packages/editor-core/src/components/StatusBar.tsx
git commit -m "a11y: add contentinfo role and live region to StatusBar"
```

---

### Task 10: OutlinePanel のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/OutlinePanel.tsx`

**Step 1: パネル全体に role と aria-label 追加**

Paper コンポーネントに:
```tsx
<Paper role="navigation" aria-label={t("outlineNavigation")} ...>
```

**Step 2: Fold/Unfold の aria-label をローカライズ**

現在英語固定のラベルを翻訳キーに変更:
```tsx
aria-label={isFolded ? t("unfoldAll") : t("foldAll")}
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/OutlinePanel.tsx
git commit -m "a11y: add navigation role and localized labels to OutlinePanel"
```

---

### Task 11: ImageNodeView のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/ImageNodeView.tsx`

**Step 1: ツールバーコンテナに role 追加**

画像ツールバーの Box に:
```tsx
<Box data-block-toolbar role="toolbar" aria-label={t("imageToolbar")} ...>
```

**Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: コミット**

```bash
git add packages/editor-core/src/ImageNodeView.tsx
git commit -m "a11y: add toolbar role to ImageNodeView"
```

---

### Task 12: EditorMenuPopovers のアクセシビリティ

**Files:**
- Modify: `packages/editor-core/src/components/EditorMenuPopovers.tsx`

**Step 1: 各 Popover の内容コンテナに role="menu" 追加**

各 Popover 内の MenuItem/IconButton リストを囲む要素に `role="menu"` を追加。MUI Popover の `slotProps` を使用:

```tsx
<Popover
  slotProps={{ paper: { role: 'menu' } }}
  ...
>
```

**Step 2: Popover 閉じ時のフォーカス復帰**

各 Popover を開いたトリガーボタンの ref を保持し、Popover の `onClose` でフォーカスを戻す。MUI Popover は `anchorEl` が設定されている場合、デフォルトでフォーカスを復帰するため、`anchorEl` が正しく設定されていることを確認。不足している場合のみ修正。

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/EditorMenuPopovers.tsx
git commit -m "a11y: add menu role to EditorMenuPopovers"
```

---

### Task 13: EditorToolbar の残り修正

**Files:**
- Modify: `packages/editor-core/src/components/EditorToolbar.tsx`

**Step 1: 比較モードボタンに aria-label 追加**

```tsx
<IconButton aria-label={t("loadCompareFile")} ...>
<IconButton aria-label={t("exportCompareFile")} ...>
```

**Step 2: ToggleButtonGroup に aria-label 追加**

比較モード:
```tsx
<ToggleButtonGroup aria-label={t("compareMode")} ...>
```

ソース/WYSIWYG 切替:
```tsx
<ToggleButtonGroup aria-label={t("editMode")} ...>
```

**Step 3: コピー成功通知を aria-live で告知**

コピー成功時に、既存の live region（MarkdownEditorPage の `role="status"` div）を活用してアナウンスする。EditorToolbar に `onAnnounce` コールバック prop を追加し、コピー成功時に `onAnnounce(t("copiedToClipboard"))` を呼び出す。

MarkdownEditorPage 側で live region のテキストを更新:
```tsx
const [announcement, setAnnouncement] = useState('');
// ...
<EditorToolbar onAnnounce={setAnnouncement} ... />
// ...
<div role="status" aria-live="polite" aria-atomic="true">
  {announcement}
</div>
```

**Step 4: 型チェック・テスト**

Run: `npx tsc --noEmit && cd packages/editor-core && npm test`
Expected: PASS

**Step 5: コミット**

```bash
git add packages/editor-core/src/components/EditorToolbar.tsx packages/editor-core/src/MarkdownEditorPage.tsx
git commit -m "a11y: add ARIA labels to toolbar toggle groups and copy notification"
```

---

### Task 14: 全体検証

**Step 1: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: テスト実行**

Run: `cd packages/editor-core && npm test && cd ../web-app && npm test`
Expected: ALL PASS

**Step 3: 最終コミット（必要な場合のみ）**

修正が必要な場合のみコミット。
