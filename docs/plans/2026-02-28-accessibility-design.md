# アクセシビリティ改善 - 設計書

## 概要

WCAG Level A/AA 準拠を目指し、全 UI コンポーネントのアクセシビリティを改善する。

## 方針

コンポーネント単位で段階的に改善。ページ構造（ランドマーク）は最初に一括整備。

## 対象コンポーネントと修正内容

### 1. ページ構造・ランドマーク（MarkdownEditorPage.tsx）

- エディタ領域を `<main>` で囲む
- OutlinePanel に `role="navigation"` + `aria-label`
- StatusBar に `role="contentinfo"`
- hidden file input に `aria-hidden="true"`

```
<div> (root)
  ├─ <a> skip-to-content (実装済み)
  ├─ EditorToolbar  role="toolbar" (実装済み)
  ├─ <main>
  │   ├─ OutlinePanel  role="navigation"
  │   └─ EditorContent / textarea
  ├─ StatusBar  role="contentinfo"
  └─ <div role="status" aria-live="polite"> (実装済み)
```

### 2. ダイアログ・フォーカス管理

**ConfirmDialog.tsx:**
- `aria-labelledby="confirm-dialog-title"` + `id="confirm-dialog-title"`
- alert 時はキャンセル、通常時は確認ボタンに autoFocus

**EditorSettingsPanel.tsx:**
- Drawer に `aria-labelledby="settings-panel-title"` + タイトルに `id`
- ToggleButtonGroup（テーマ・言語）に `aria-label`

**HelpDialog.tsx:**
- TOC スクロール後にフォーカスを見出し要素へ移動

### 3. BubbleMenu・検索バー

**EditorBubbleMenu.tsx:**
- 内側 Paper に `role="toolbar"` + `aria-label`
- 全 format ボタンに `aria-label`
- Arrow キーによるフォーカス移動

**SearchReplaceBar.tsx:**
- トグルボタン（Aa, Ab|, .*）に `aria-label`
- 置換ボタンの `aria-label`（「1件置換」「全件置換」）
- マッチ数に `aria-live="polite"`

**FsSearchBar.tsx:**
- SearchReplaceBar と同様の修正

### 4. StatusBar・OutlinePanel・ImageNodeView

**StatusBar.tsx:**
- `role="contentinfo"` 追加
- 行番号・文字数に `aria-live="polite"` `aria-atomic="true"`
- dirty 表示を `aria-label="ファイル名 (未保存)"` で補足

**OutlinePanel.tsx:**
- パネルに `role="navigation"` + `aria-label`
- Fold/Unfold の aria-label をローカライズ

**ImageNodeView.tsx:**
- Delete, Edit, Fullscreen, Collapse ボタンに `aria-label`

### 5. Popover・インジケータ・翻訳

**EditorMenuPopovers.tsx:**
- Popover に `aria-label`
- 閉じ時にトリガーボタンへフォーカス復帰

**EditorToolbar.tsx:**
- 比較モードボタンに `aria-label`
- コピー成功を `aria-live` で通知

**翻訳キー（ja.json / en.json）:**
- BubbleMenu, SearchBar, OutlinePanel, ImageNodeView, StatusBar 等の aria-label 用キー追加

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `editor-core/src/MarkdownEditorPage.tsx` | main ランドマーク、file input aria-hidden |
| `editor-core/src/providers/ConfirmDialog.tsx` | aria-labelledby, id, autoFocus |
| `editor-core/src/components/EditorSettingsPanel.tsx` | Drawer aria-labelledby, ToggleButtonGroup aria-label |
| `editor-core/src/components/HelpDialog.tsx` | TOC フォーカス管理 |
| `editor-core/src/components/EditorBubbleMenu.tsx` | role, aria-label, キーボードナビゲーション |
| `editor-core/src/components/SearchReplaceBar.tsx` | aria-label, aria-live |
| `editor-core/src/components/FsSearchBar.tsx` | aria-label, aria-live |
| `editor-core/src/components/StatusBar.tsx` | role, aria-live, dirty 表示 |
| `editor-core/src/components/OutlinePanel.tsx` | role, aria-label ローカライズ |
| `editor-core/src/ImageNodeView.tsx` | ボタン aria-label |
| `editor-core/src/components/EditorMenuPopovers.tsx` | aria-label, フォーカス復帰 |
| `editor-core/src/components/EditorToolbar.tsx` | 比較モードボタン, コピー通知 |
| `editor-core/src/i18n/ja.json` | 翻訳キー追加 |
| `editor-core/src/i18n/en.json` | 翻訳キー追加 |

## スコープ外

- Drag-drop のスクリーンリーダー対応（複雑度が高く別タスクとする）
- 画像 alt テキストの検証ツール
- WCAG AAA 準拠
