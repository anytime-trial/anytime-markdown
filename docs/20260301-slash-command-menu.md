# スラッシュコマンド（`/` メニュー）実装

**ステータス: 完了**
**日付: 2026-03-01**

## 概要

空行で `/` を入力するとコマンド一覧が表示され、ブロック挿入が可能になるスラッシュコマンド機能を実装。

## 新規ファイル（3ファイル）

| ファイル | 説明 |
|---|---|
| `extensions/slashCommandItems.ts` | コマンド定義（12コマンド）+ フィルタリング関数 |
| `extensions/slashCommandExtension.ts` | ProseMirror Plugin 拡張（キー入力監視・状態管理） |
| `components/SlashCommandMenu.tsx` | React UI（MUI Popper + MenuList） |

## 変更ファイル（4ファイル）

| ファイル | 変更内容 |
|---|---|
| `hooks/useEditorConfig.ts` | `SlashCommandExtension` を extensions に追加 |
| `MarkdownEditorPage.tsx` | `SlashCommandMenu` コンポーネントを配置 |
| `i18n/en.json` | 英語翻訳キー追加 |
| `i18n/ja.json` | 日本語翻訳キー追加 |

## 対応コマンド

Heading 1/2/3, Bullet List, Ordered List, Task List, Blockquote, Code Block, Table, Horizontal Rule, Mermaid Diagram, PlantUML Diagram

## 設計判断

- `@tiptap/suggestion` 不使用（外部依存なし、既存パターン踏襲）
- MUI Popper + Paper + MenuList（エディタ内ポップオーバーと統一）
- IME compositionstart/end でガード（日本語入力対応）
- image コマンドは除外（ダイアログ連携が必要なため、別途対応）
- WYSIWYG モード専用（sourceMode では無効化）
- トップレベル paragraph のみで発火（codeBlock・table 内では不活性）
