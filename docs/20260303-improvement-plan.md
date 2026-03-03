# Anytime Markdown 改善計画

**作成日**: 2026-03-03
**レビューチーム**: Designer / A11y / Engineer
**対象**: packages/web-app + packages/editor-core
**H3/H4/H6 実装完了**: 2026-03-03
**M4/M5/M6/M8 実装完了**: 2026-03-03

---

## 仮定一覧

| # | 仮定内容 | 影響度 |
|---|---------|--------|
| A1 | 主要ユーザーはデスクトップブラウザ利用（モバイルは補助的） | 高 |
| A2 | 日本語・英語の2言語のみサポート継続 | 中 |
| A3 | WCAG 2.2 AA を目標準拠レベルとする | 高 |
| A4 | 本番環境では console.log/debug は不要（デバッグ目的のみ） | 中 |
| A5 | MUI テーマのデフォルトコントラスト比は AA 準拠と仮定し、カスタム色のみ検証対象 | 中 |
| A6 | PlantUML 外部サーバー依存は現状維持（自前レンダリングへの移行は対象外） | 低 |

---

## 現状サマリー

**Designer**: ランディングページからエディタへの導線は明快。ただしエディタ内部のツールバーが密集し、機能の発見性が低い。NodeView ツールバーはホバー/選択時のみ表示で初見ユーザーが気づきにくい。ステータスバーの情報密度が高く、未保存インジケータの視認性が不十分。

**A11y**: `lang` 属性、`prefers-reduced-motion` サポート、MUI Dialog のフォーカストラップなど基本項目は対応済み。一方、Popover への ARIA 属性欠落、ドラッグハンドルのキーボード操作不可、ダイアグラムの代替テキスト不足、エディタ本体のフォーカスインジケータ非表示が主要課題。

**Engineer**: セキュリティ面は DOMPurify の多重適用で堅牢。Next.js/React のベストプラクティスにも概ね準拠。ただし MermaidNodeView.tsx が 894 行で保守性低下、本番環境に console.log が残存、HelpDialog の DOMPurify 設定が未指定。

---

## 課題一覧

### 優先度: 高

| # | 課題 | カテゴリ | 担当観点 |
|---|------|---------|---------|
| H1 | 本番環境に console.log/debug が残存（MermaidNodeView, useDiagramResize） | パフォーマンス | Engineer |
| H2 | Popover に role/aria-label がない（Mermaid/HTML/Math SamplePopover） | A11y | A11y |
| H3 | ドラッグハンドルにキーボード操作がない（role="button" + tabIndex=0 だが onKeyDown なし） | A11y | A11y |
| H4 | ダイアグラム/PlantUML の alt text が汎用すぎる（「Flowchart」のみ） | A11y | A11y |
| H5 | Popover 閉鎖後のフォーカス復帰がない | A11y | A11y |
| H6 | HelpDialog の DOMPurify がデフォルト設定（明示的なタグ制限なし） | セキュリティ | Engineer |
| H7 | エディタ本体のフォーカスインジケータが非表示（outline: "none"） | A11y | A11y |

### 優先度: 中

| # | 課題 | カテゴリ | 担当観点 |
|---|------|---------|---------|
| M1 | ツールバーが密集し機能の発見性が低い（ボタン30+個） | UI/UX | Designer |
| M2 | ステータスバーの未保存インジケータが `*` のみで視認性不足 | UI/UX | Designer |
| M3 | MermaidNodeView.tsx が 894 行で単一責任原則違反 | 保守性 | Engineer |
| M4 | useEffect の依存配列が多く ResizeObserver が頻繁に再作成 | パフォーマンス | Engineer |
| M5 | ドラッグハンドルの opacity 0.5 × text.secondary でコントラスト不足 | A11y | A11y/Designer |
| M6 | エンコーディング変更時に確認ダイアログがない | UI/UX | Designer |
| M7 | Skip to editor リンクが未実装 | A11y | A11y |
| M8 | ToggleButton に aria-pressed がない | A11y | A11y |
| M9 | EditorToolbar.tsx が 715 行で複雑 | 保守性 | Engineer |
| M10 | MermaidNodeView のテストが存在しない | テスト | Engineer |
| M11 | モバイル中間サイズ（sm）のツールバー対応が不足 | UI/UX | Designer |
| M12 | mathInlineExtension のエラー時に DOMPurify 未適用 | セキュリティ | Engineer |

### 優先度: 低

| # | 課題 | カテゴリ | 担当観点 |
|---|------|---------|---------|
| L1 | ブロックラベル（H1, P 等）がホバー時のみ表示で発見性低い | UI/UX | Designer |
| L2 | ランディングページとエディタのブランドカラー不統一 | UI/UX | Designer |
| L3 | ダイアログの aria-describedby 不足 | A11y | A11y |
| L4 | prefers-reduced-motion が一部 transform に未適用 | A11y | A11y |
| L5 | リサイズハンドルの aria-valuenow が undefined になる場合がある | A11y | A11y |
| L6 | webpack alias と tsconfig paths の二重定義 | 保守性 | Engineer |
| L7 | PDF エクスポートの進捗表示がない | UI/UX | Designer |
| L8 | 画像エラー時のユーザーフィードバック不足 | UI/UX | Designer |

---

## 改善案

### H1: console.log 削除

- **担当観点**: Engineer
- **工数**: XS（30分以内）
- **期待効果**: 本番環境のコンソールノイズ除去、DevTools パフォーマンス改善
- **対象ファイル**: MermaidNodeView.tsx (行153, 166, 168), useDiagramResize.ts (行41, 57)
- **方法**: `console.log` / `console.debug` を削除。デバッグ用途なら `if (process.env.NODE_ENV === 'development')` でガード

### H2: Popover への ARIA 属性追加

- **担当観点**: A11y
- **工数**: XS（1時間以内）
- **期待効果**: スクリーンリーダーが Popover の目的を認識可能に
- **対象ファイル**: MermaidSamplePopover.tsx, HtmlSamplePopover.tsx, MathSamplePopover.tsx
- **方法**: 各 Popover に `role="dialog"` と `aria-label={t("insertSample")}` を追加
- **A11y レビュー**: 必須 - WCAG 4.1.2 準拠に直結

### H3: ドラッグハンドルのキーボード対応

- **担当観点**: A11y
- **工数**: S（2-3時間）
- **期待効果**: キーボードユーザーがブロックの並べ替え可能に
- **対象ファイル**: MermaidNodeView.tsx のドラッグハンドル Box 要素
- **方法**: `onKeyDown` で Alt+ArrowUp/Down によるブロック移動を実装。`aria-roledescription` を `"draggable item"` に変更
- **Designer レビュー**: 推奨 - 操作説明のツールチップ追加が望ましい

### H4: ダイアグラム alt text の改善

- **担当観点**: A11y
- **工数**: S（2-3時間）
- **期待効果**: スクリーンリーダーがダイアグラムの概要を読み上げ可能に
- **対象ファイル**: MermaidNodeView.tsx
- **方法**: code の先頭数行からノード名/参加者名を抽出し、`aria-label` に含める。例: `"Flowchart: Start, Condition, Process A, Process B, End"`。過度に長い場合は `aria-describedby` で隠しテキストに分離
- **Engineer レビュー**: 推奨 - 抽出ロジックの計算コストを考慮（メモ化推奨）

### H5: Popover 閉鎖後のフォーカス復帰

- **担当観点**: A11y
- **工数**: XS（1時間以内）
- **期待効果**: Popover 閉じた後にフォーカスがツールバーボタンに戻る
- **対象ファイル**: MermaidSamplePopover, HtmlSamplePopover, MathSamplePopover の onClose
- **方法**: MUI Popover の `disableRestoreFocus` がデフォルト false のため、`anchorEl` にフォーカスが戻るはず。動作確認し、戻らない場合は `onClose` 内で `anchorEl?.focus()` を明示的に呼ぶ

### H6: HelpDialog の DOMPurify 設定明示化

- **担当観点**: Engineer
- **工数**: S（1-2時間）
- **期待効果**: marked 出力の HTML に対して許可タグを限定し、防御的サニタイズ
- **対象ファイル**: HelpDialog.tsx (行127)
- **方法**: `HELP_SANITIZE_CONFIG` 定数を定義（heading, p, ul, ol, li, a, code, pre, strong, em, table 系タグのみ許可）し、`DOMPurify.sanitize(html, HELP_SANITIZE_CONFIG)` に変更

### H7: エディタのフォーカスインジケータ追加

- **担当観点**: A11y
- **工数**: XS（30分）
- **期待効果**: キーボードユーザーがエディタ領域のフォーカス状態を視認可能に
- **対象ファイル**: editorStyles.ts
- **方法**: `.ProseMirror:focus-visible` に `outline: 2px solid` + `outlineColor: "primary.main"` を追加。`outline: "none"` は `:focus` のみに限定

### M1: ツールバーのグループ化

- **担当観点**: Designer
- **工数**: M（4-8時間）
- **期待効果**: 機能の発見性向上、視覚的な情報階層の明確化
- **対象ファイル**: EditorToolbar.tsx
- **方法**: ボタンを論理グループに分割（ファイル操作 | テキスト装飾 | ブロック挿入 | ダイアグラム | 表示）し、グループ間に `Divider` を追加
- **A11y レビュー**: 必須 - 各グループに `role="group"` + `aria-label` が必要

### M2: 未保存インジケータの強化

- **担当観点**: Designer
- **工数**: XS（1時間）
- **期待効果**: ユーザーが未保存状態を見落とさない
- **対象ファイル**: StatusBar.tsx
- **方法**: `*` に加えて `FiberManualRecord` アイコン（小さい丸）を追加し、Tooltip で "未保存の変更があります" を表示。`aria-label` にも反映
- **A11y レビュー**: 必須 - 色のみに依存しない表現が必要（WCAG 1.4.1）

### M3: MermaidNodeView の分割

- **担当観点**: Engineer
- **工数**: L（2-3日）
- **期待効果**: 保守性向上、各ダイアグラムタイプの独立テスト可能化
- **対象ファイル**: MermaidNodeView.tsx (894行)
- **方法**: 共通フレーム（ツールバー、折りたたみ、全画面）を残し、Mermaid/PlantUML/HTML/Math の各コンテンツを個別コンポーネントに抽出
- **Designer レビュー**: 質問 - 分割によるUI変更がないことを確認

### M6: エンコーディング変更の確認ダイアログ

- **担当観点**: Designer
- **工数**: S（2時間）
- **期待効果**: 意図しないエンコーディング変更によるデータ損失を防止
- **対象ファイル**: StatusBar.tsx のエンコーディングメニュー
- **方法**: エンコーディング変更選択時に「エンコーディングを {newEncoding} に変更しますか？一部の文字が正しく表示されなくなる可能性があります。」の確認ダイアログを表示
- **A11y レビュー**: 推奨 - ダイアログに aria-describedby で影響説明を追加

### M7: Skip to editor リンク

- **担当観点**: A11y
- **工数**: XS（1時間）
- **期待効果**: キーボードユーザーがツールバーをスキップしてエディタに直接アクセス
- **対象ファイル**: MarkdownEditorPage.tsx
- **方法**: ページ先頭に `<a href="#editor-content" className="skip-link">` を追加。CSS で `position: absolute; left: -9999px` + `:focus { left: 0 }` パターンを適用。i18n キー `skipToEditor` は既存

---

## アクセシビリティ監査結果

### WCAG 2.2 AA 準拠状況

| 基準 | 状態 | 課題 # |
|------|------|--------|
| 1.1.1 非テキストコンテンツ | 部分準拠 | H4 |
| 1.4.1 色の使用 | 部分準拠 | M2 |
| 1.4.3 コントラスト（最低限） | 部分準拠 | M5 |
| 1.4.11 非テキストのコントラスト | 部分準拠 | M5 |
| 2.1.1 キーボード | 不準拠 | H3 |
| 2.3.3 モーションの動作 | 部分準拠 | L4 |
| 2.4.1 ブロックスキップ | 不準拠 | M7 |
| 2.4.3 フォーカス順序 | 部分準拠 | H5 |
| 2.4.7 フォーカスの可視化 | 不準拠 | H7 |
| 3.1.1 ページの言語 | 準拠 | - |
| 4.1.2 名前・役割・値 | 部分準拠 | H2, M8 |

### 準拠済み項目

- `<html lang>` の設定 (3.1.1)
- MUI Dialog のフォーカストラップ (2.4.3)
- `prefers-reduced-motion` のトランジション無効化（主要箇所）(2.3.3)
- 画像の alt 属性（ユーザー設定可能）(1.1.1)

---

## 改善ロードマップ

### Quick Win（1-2日、即座に実行可能）

| 改善 | 工数 | 効果 |
|------|------|------|
| H1: console.log 削除 | XS | 本番ログ除去 |
| H2: Popover ARIA 追加 | XS | スクリーンリーダー対応 |
| H5: Popover フォーカス復帰確認 | XS | フォーカス管理 |
| H7: エディタフォーカスインジケータ | XS | WCAG 2.4.7 準拠 |
| M2: 未保存インジケータ強化 | XS | 視認性向上 |
| M7: Skip to editor リンク | XS | WCAG 2.4.1 準拠 |
| M12: mathInline DOMPurify 適用 | XS | 防衛的セキュリティ |

### 短期（1-2週間）

| 改善 | 工数 | 効果 |
|------|------|------|
| H3: ドラッグハンドルのキーボード対応 | S | WCAG 2.1.1 準拠 |
| H4: ダイアグラム alt text 改善 | S | WCAG 1.1.1 準拠 |
| H6: HelpDialog DOMPurify 設定 | S | セキュリティ強化 |
| M1: ツールバーのグループ化 | M | 発見性向上 |
| M4: useEffect deps 最適化 | S | パフォーマンス改善 |
| M5: ドラッグハンドルコントラスト改善 | XS | WCAG 1.4.3 準拠 |
| M6: エンコーディング確認ダイアログ | S | データ損失防止 |
| M8: ToggleButton aria-pressed | XS | WCAG 4.1.2 準拠 |

### 中期（1-2ヶ月）

| 改善 | 工数 | 効果 |
|------|------|------|
| M3: MermaidNodeView 分割 | L | 保守性・テスト性向上 |
| M9: EditorToolbar リファクタリング | M | コード可読性向上 |
| M10: MermaidNodeView テスト追加 | M | 品質保証 |
| M11: モバイル中間サイズ対応 | M | レスポンシブ改善 |
| L1-L8: 低優先課題群 | S-M | 漸進的改善 |

---

## リスクと未解決課題

### リスク

| リスク | 影響度 | 緩和策 |
|--------|--------|--------|
| M3 MermaidNodeView 分割で props drilling が複雑化 | 中 | Context API または共通フックで共有状態を管理 |
| H3 ドラッグハンドルのキーボード操作が ProseMirror の内部処理と競合 | 中 | TipTap/ProseMirror のドラッグ API を確認し、NodeView レベルで処理 |
| M1 ツールバーグループ化で既存ユーザーの操作習慣が変化 | 低 | ボタンの並び順は維持し、グループ境界のみ追加 |

### 未解決課題

1. **PlantUML の代替テキスト**: 外部サーバーでレンダリングされるため、SVG 内テキストを解析できない。code から説明を生成するか、ユーザーに alt text 入力を促すか検討が必要
2. **ダークモードのコントラスト検証**: カスタム色（`settings.darkTextColor`, `settings.darkBgColor`）はユーザー設定に依存するため、任意の組み合わせで AA 準拠を保証できない。色選択 UI でコントラスト比を表示するか検討
3. **スクリーンリーダーでの実機テスト**: 本レビューはコードベースの静的解析に基づく。NVDA/JAWS/VoiceOver での実機テストが必要

---

## 品質チェック結果

### Designer チェック

- [x] Quick Win の改善は既存フローの手順を増やさず、視認性のみ向上
- [x] M1 ツールバーグループ化はボタン数を減らさず、Divider 追加のみ
- [x] M2 未保存インジケータはアイコン追加のみで操作フロー変更なし

### A11y チェック

- [x] H2/H7/M7/M8 でキーボード操作完結の改善を含む
- [x] M2 で色のみ依存を排除（アイコン + aria-label 追加）
- [x] H4 で代替テキスト不備に対応
- [x] すべての改善案に ARIA 属性の考慮を含む

### Engineer チェック

- [x] すべての改善案に T-shirt sizing 付き
- [x] XS/S の改善は即座に実行可能、依存関係なし
- [x] L 規模の M3 は段階的に実行可能（ダイアグラムタイプごとに分割）

---

## 使用スキル

| エージェント | 使用スキル |
|-------------|-----------|
| Designer | UI/UX ヒューリスティック評価、情報設計分析、インタラクションデザインレビュー、レスポンシブデザイン監査 |
| A11y | WCAG 2.2 AA 準拠監査、ARIA パターン分析、キーボードナビゲーション評価、コントラスト比検証、スクリーンリーダー互換性分析 |
| Engineer | Next.js ベストプラクティス比較、パフォーマンスプロファイリング（静的）、コード複雑度分析、セキュリティレビュー（DOMPurify/XSS）、T-shirt sizing 見積もり |
