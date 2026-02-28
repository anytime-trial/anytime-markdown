# Anytime Markdown 改善計画

> 3エージェントチーム（Designer / A11y / Engineer）による Phase Gate 制レビュー結果

---

## 仮定一覧

| # | 仮定 | 影響度 | 根拠 |
|---|------|--------|------|
| 1 | 主要ユーザーはデスクトップ Chrome/Edge を使用 | 高 | File System Access API 対応ブラウザを優先実装 |
| 2 | モバイル利用は全体の 20-30% 程度 | 中 | Capacitor 対応済みだがモバイル専用最適化は限定的 |
| 3 | 対象ドキュメントサイズは 95% が 1,000行以下 | 中 | パフォーマンス最適化の優先度判断に影響 |
| 4 | ユーザーの大半は日本語話者（英語はセカンダリ） | 中 | 翻訳品質の優先度に影響 |
| 5 | スクリーンリーダー利用者は少数だが対応は必須 | 高 | WCAG AA 準拠を目標とする |
| 6 | VS Code 拡張版が主要配布チャネル | 中 | Web 版の PWA 最適化優先度に影響 |

---

## 現状サマリー

### 構成
- **editor-core**: Tiptap ベースの共有エディタライブラリ（81ソースファイル）
- **web-app**: Next.js 15 + MUI + PWA（Service Worker 対応済み）
- **mobile-app**: Capacitor Android アプリ
- **vscode-extension**: VS Code 拡張機能

### 強み
- Tiptap エディタの統合が堅実で、リッチ編集・ソースモード・Diff マージを実現
- DOMPurify によるセキュリティ対策が適切
- テスト基盤が整備（230テスト / 19スイート）
- i18n 対応（日本語・英語）
- WAI-ARIA ツールバーパターンの部分実装

### 主要な課題領域
- **モバイル対応**: ツールバー・検索バー・アウトラインが小画面で破綻
- **オンボーディング**: 初回ユーザーへのガイダンスが皆無
- **データ保護**: 未保存警告・localStorage エラーハンドリングが不十分
- **WCAG 準拠**: Critical 3件 / Major 7件の違反が残存
- **技術的負債**: メインコンポーネント 1,140行、npm 脆弱性 12件

---

## 課題一覧

### 高優先度

| ID | カテゴリ | 課題 | 担当観点 | 工数 |
|----|---------|------|---------|------|
| H-01 | Security | npm audit で 12件の高リスク脆弱性（diff DoS, serialize-javascript RCE, minimatch ReDoS） | Engineer | M |
| H-02 | Mobile | EditorToolbar がモバイルで破綻（30+ ボタンが 1行に詰まり、スクロール不可） | Designer | M |
| H-03 | Data | 未保存変更の beforeunload 警告なし。ページ離脱でデータ喪失リスク | Designer+Engineer | S |
| H-04 | A11y | StatusBar のファイル状態表示が opacity:0.7 で色コントラスト不足（WCAG 1.4.11） | A11y | XS |
| H-05 | A11y | 画像 alt テキストが空の場合のフォールバックなし（WCAG 1.1.1） | A11y | S |
| H-06 | A11y | Mermaid/PlantUML SVG に代替テキストなし（WCAG 1.1.1） | A11y | S |
| H-07 | UX | 検索バーの置換ボタン（"1", "*"）が意味不明。トグルボタンに aria-label 不足 | Designer+A11y | S |
| H-08 | Onboarding | 初回アクセス時のガイダンスなし。空エディタに戸惑う | Designer | M |

### 中優先度

| ID | カテゴリ | 課題 | 担当観点 | 工数 |
|----|---------|------|---------|------|
| M-01 | Robustness | localStorage の QuotaExceededError 未処理。5MB 超で保存失敗 | Engineer | S |
| M-02 | Performance | EditorToolbar が useEditorState で毎キー入力再レンダリング。React.memo 未適用 | Engineer | M |
| M-03 | UX | StatusBar が小さく（caption サイズ）、ファイル名・行番号が見落としやすい | Designer | S |
| M-04 | A11y | EditorSettingsPanel の Slider に aria-valuemin/max/now 不足（WCAG 3.3.2） | A11y | XS |
| M-05 | A11y | OutlinePanel のタイトルが `<Typography>` で見出し要素でない（WCAG 1.3.1） | A11y | XS |
| M-06 | Mobile | OutlinePanel が xs/sm で非表示だが代替ナビゲーションなし | Designer | M |
| M-07 | Mobile | SearchReplaceBar がモバイル画面で要素が重なる | Designer | S |
| M-08 | UX | ファイル操作 UI の一貫性不足。非対応ブラウザでの説明なし | Designer | S |
| M-09 | Debt | MarkdownEditorPage が 1,140行で責務過多（11 useState, 3 Ref, 複数 hook） | Engineer | L |
| M-10 | A11y | globals.css に `a:focus-visible` ルールなし。ヘルプ内リンクのフォーカス不可視 | A11y | XS |
| M-11 | Test | MarkdownEditorPage, InlineMergeView の統合テストなし | Engineer | M |
| M-12 | A11y | 画像リサイズハンドルがキーボード操作不可（WCAG 2.1.1） | A11y | S |

### 低優先度

| ID | カテゴリ | 課題 | 担当観点 | 工数 |
|----|---------|------|---------|------|
| L-01 | UX | EditorBubbleMenu がタッチ環境で操作困難（選択解除で即消滅） | Designer | M |
| L-02 | UX | Replace All に確認ダイアログなし | Designer | XS |
| L-03 | UX | 翻訳テキストの文体不統一（命令形/名詞形混在） | Designer | S |
| L-04 | UX | アウトラインパネルの fold/unfold にアニメーションなし | Designer | S |
| L-05 | Debt | types.ts が型定義とロジックを混在。モジュール分割不足 | Engineer | S |
| L-06 | Debt | diff パッケージのバージョン不統一（editor-core: v7, web-app: v8） | Engineer | XS |
| L-07 | Arch | getBaseExtensions が拡張ポイントなし。プラグインモデル未対応 | Engineer | S |
| L-08 | A11y | ConfirmDialog の autoFocus ロジックが不統一（WCAG 2.4.3） | A11y | XS |
| L-09 | UX | 操作結果（クリア、リセット等）の toast/スナックバー通知なし | Designer | S |
| L-10 | A11y | ヘルプダイアログのキーボード操作ドキュメント不足 | A11y | S |

---

## 改善案

### H-01: npm 脆弱性の修正

- **担当観点**: Engineer
- **工数**: M（依存関係の互換性確認含む）
- **期待効果**: 高リスク脆弱性 12件を解消。セキュリティ監査クリア

**改善内容:**
1. `diff` パッケージを全ワークスペースで `^8.0.3` に統一
2. `npm audit fix` で自動修正可能な脆弱性を解消
3. `serialize-javascript` は webpack 依存のため、webpack バージョン更新で対応
4. CI に `npm audit --audit-level=high` チェックを追加

**A11y レビュー**: 該当なし
**Designer レビュー**: 該当なし

---

### H-02: EditorToolbar のモバイル対応

- **担当観点**: Designer + Engineer
- **工数**: M（レスポンシブブレークポイント設計 + 実装）
- **期待効果**: モバイルユーザーが全機能にアクセス可能に

**改善内容:**
1. xs/sm ブレークポイントでボタンを 3グループに分離:
   - **常時表示**: ファイル操作、Undo/Redo、モード切替
   - **"More" メニュー内**: 書式、挿入、テンプレート
   - **非表示**: 比較モード（モバイルでは使用頻度低）
2. `overflow-x: auto` で水平スクロールを許可
3. `React.memo` でツールバー全体をメモ化（H-02 + M-02 同時対応）

**A11y レビュー:**
- 必須: "More" メニューに `aria-haspopup="true"` と `aria-expanded` を追加
- 推奨: メニュー内のボタンにもキーボードナビゲーション（Arrow キー）を実装

---

### H-03: 未保存変更の保護

- **担当観点**: Designer + Engineer
- **工数**: S
- **期待効果**: データ喪失防止。ユーザー信頼度向上

**改善内容:**
1. `beforeunload` イベントリスナーを追加:
```tsx
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (isDirty) { e.preventDefault(); }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```
2. `isDirty` フラグを `useFileSystem` hook の状態と連携

**A11y レビュー:**
- 推奨: ブラウザネイティブの確認ダイアログを使用（カスタムダイアログはスクリーンリーダー対応が複雑）

---

### H-04: StatusBar のコントラスト改善

- **担当観点**: A11y
- **工数**: XS
- **期待効果**: WCAG 1.4.11 準拠。ロービジョンユーザーの視認性向上

**改善内容:**
- `opacity: 0.7` を削除し、`color: "text.secondary"` に変更
- dirty インジケータ `*` の色を `warning.main` に設定（4.5:1 以上のコントラスト比を確保）

**Designer レビュー:**
- 推奨: dirty 状態を `*` だけでなく、ファイル名の左にドット（`●`）で表現すると視認性向上

---

### H-05: 画像 alt テキストのフォールバック

- **担当観点**: A11y
- **工数**: S
- **期待効果**: WCAG 1.1.1 準拠。スクリーンリーダーで画像内容を把握可能に

**改善内容:**
1. `ImageNodeView.tsx` の `alt={alt || ""}` を `alt={alt || t("imageNoAlt")}` に変更
2. 画像挿入ダイアログに alt テキスト入力フィールドを追加（任意）
3. alt が空の画像にエディタ上で視覚的警告アイコンを表示

**Designer レビュー:**
- 必須: 警告アイコンは編集モードのみ表示。プレビュー/エクスポートでは非表示にすること
- 推奨: alt テキスト入力を画像ツールバーに追加すると導線が自然

---

### H-06: Mermaid/PlantUML SVG の代替テキスト

- **担当観点**: A11y + Engineer
- **工数**: S
- **期待効果**: WCAG 1.1.1 準拠。図形コンテンツのアクセシビリティ確保

**改善内容:**
1. SVG コンテナに `role="img"` と `aria-label` を追加
2. aria-label にはダイアグラムの種類（"フローチャート", "シーケンス図" 等）を自動判定
3. 元のコードブロックテキストを `aria-describedby` で参照可能にする

**Designer レビュー:**
- 推奨: 「図の説明を表示」ボタンを追加し、コードブロックの折りたたみ表示で対応

---

### H-07: 検索バーの UX + アクセシビリティ改善

- **担当観点**: Designer + A11y
- **工数**: S
- **期待効果**: 検索・置換の操作性向上。WCAG 準拠

**改善内容:**
1. 置換ボタンのラベルを `"1"` → アイコン + `aria-label={t("replace")}` に変更
2. 置換全ボタンのラベルを `"*"` → アイコン + `aria-label={t("replaceAll")}` に変更
3. マッチ数表示を `aria-live="polite"` で動的告知（実装済みの確認）
4. トグルボタン（Aa, Ab|, .*）の `aria-label` が正しく設定されているか確認

**Engineer レビュー:**
- 質問: debounce 300ms は UX として長すぎないか？ → Designer: 150-200ms に短縮を推奨

---

### H-08: オンボーディング体験

- **担当観点**: Designer
- **工数**: M
- **期待効果**: 初回ユーザーの離脱率低下。機能発見率向上

**改善内容:**
1. 初訪問時にウェルカムコンテンツを表示（localStorage フラグで制御）:
   - エディタの基本操作説明（3-5行のマークダウン）
   - 「ヘルプを見る」「テンプレートを使う」へのリンク
2. 空エディタ時のプレースホルダーテキスト表示

**A11y レビュー:**
- 必須: ウェルカムコンテンツは `role="region"` + `aria-label` でマークアップ
- 推奨: 「閉じる」ボタンにフォーカスを自動設定

**Engineer レビュー:**
- 推奨: ウェルカムコンテンツは通常のマークダウンとして表示し、特殊なコンポーネント追加は避ける

---

## アクセシビリティ監査結果

### 準拠状況サマリ

| レベル | 基準数 | 準拠 | 部分準拠 | 非準拠 |
|--------|--------|------|---------|--------|
| A | 30 | 24 | 4 | 2 |
| AA | 20 | 15 | 3 | 2 |

### Critical 違反（即時対応必須）

| ID | WCAG 基準 | 内容 | 対応改善案 |
|----|-----------|------|-----------|
| A-001 | 2.4.7 Focus Visible | カスタム interactive 要素の focus-visible が不統一 | H-04, M-10 |
| A-002 | 1.4.11 Non-text Contrast | StatusBar のファイル状態表示がコントラスト不足 | H-04 |
| A-003 | 4.1.3 Status Messages | 検索バーの置換ボタンラベルが aria-hidden で非表示 | H-07 |

### Major 違反（短期対応）

| ID | WCAG 基準 | 内容 | 対応改善案 |
|----|-----------|------|-----------|
| A-004 | 1.1.1 Non-text Content | 画像 alt テキスト欠如 | H-05 |
| A-005 | 1.3.1 Info and Relationships | OutlinePanel タイトルが見出し要素でない | M-05 |
| A-006 | 3.3.2 Labels or Instructions | Slider の ARIA 属性不足 | M-04 |
| A-007 | 1.1.1 Non-text Content | Mermaid/PlantUML SVG に代替テキストなし | H-06 |
| A-008 | 4.1.3 Status Messages | 動的コンテンツ更新の告知不足 | H-07 |
| A-009 | 1.4.1 Use of Color | disabled ボタンが色のみで区別 | M-02 |
| A-010 | 1.3.1 Info and Relationships | HelpDialog のテーブルヘッダー構造 | M-11 |

### 準拠済みの項目（良好）

- HTML lang 属性設定済み
- MUI Dialog の aria-labelledby 実装済み
- ツールバー WAI-ARIA パターン実装済み（Arrow キーナビゲーション）
- DOMPurify による XSS 防御
- Skip-to-content リンク実装済み
- StatusBar の aria-live region 実装済み
- OutlinePanel の role="navigation" 実装済み
- BubbleMenu の role="toolbar" + キーボードナビゲーション実装済み

---

## 改善ロードマップ

### Quick Win（1-2日）

| 改善案 | 工数 | 効果 |
|--------|------|------|
| H-04: StatusBar コントラスト修正 | XS | WCAG Critical 解消 |
| M-04: Slider ARIA 属性追加 | XS | WCAG Major 解消 |
| M-05: OutlinePanel タイトルを `<h2>` に変更 | XS | WCAG Major 解消 |
| M-10: `a:focus-visible` CSS ルール追加 | XS | WCAG Minor 解消 |
| L-06: diff バージョン統一 | XS | 依存関係の整合性 |
| L-08: ConfirmDialog autoFocus 修正 | XS | フォーカス管理改善 |

### 短期（1-2週間）

| 改善案 | 工数 | 効果 |
|--------|------|------|
| H-01: npm 脆弱性修正 | M | セキュリティリスク排除 |
| H-03: beforeunload 警告追加 | S | データ喪失防止 |
| H-05: 画像 alt フォールバック | S | WCAG 準拠 |
| H-06: SVG 代替テキスト | S | WCAG 準拠 |
| H-07: 検索バー UX + a11y | S | 操作性 + WCAG 準拠 |
| M-01: localStorage エラーハンドリング | S | 堅牢性向上 |
| M-03: StatusBar サイズ改善 | S | 視認性向上 |
| M-08: ファイル操作 UI 説明 | S | UX 一貫性 |
| M-12: 画像リサイズのキーボード操作 | S | WCAG 準拠 |

### 中期（1-2ヶ月）

| 改善案 | 工数 | 効果 |
|--------|------|------|
| H-02: ツールバーモバイル対応 | M | モバイル UX 大幅改善 |
| H-08: オンボーディング | M | 初回ユーザー定着率向上 |
| M-02: EditorToolbar メモ化 | M | パフォーマンス改善 |
| M-06: OutlinePanel モバイルドロワー | M | モバイルナビゲーション |
| M-07: SearchBar モバイル対応 | S | モバイル操作性 |
| M-09: MarkdownEditorPage リファクタリング | L | 保守性向上 |
| M-11: 統合テスト追加 | M | 品質保証強化 |

---

## リスクと未解決課題

### リスク

| リスク | 影響度 | 軽減策 |
|--------|--------|--------|
| npm audit fix で破壊的変更が発生 | 高 | テストスイート全実行後にマージ。diff v8 の互換性を事前検証 |
| ツールバーモバイル対応で既存ショートカットが動作しなくなる | 中 | デスクトップ/モバイルで分岐テストを追加 |
| オンボーディングコンテンツが localStorage 依存 | 低 | フラグが消えた場合のフォールバック（再表示しない） |
| React.memo 導入で props 比較コストが増加 | 低 | プロファイリングで効果を測定後に適用 |

### 未解決課題

| 課題 | 状態 | 備考 |
|------|------|------|
| Capacitor v7 → v8 マイグレーション | 保留 | CapacitorFileSystemProvider が v8 peer dep を要求。モバイルビルド設定と合わせて対応 |
| CSP（Content Security Policy）設定 | 未調査 | 外部 PlantUML サーバーへの接続を許可する CSP が必要 |
| Undo/Redo スタックのメモリ制限 | 未対応 | 大規模ドキュメントでメモリリークの可能性。Tiptap の history extension 設定で depth を制限 |
| PWA オフライン時のファイル保存 | 未設計 | Service Worker キャッシュとローカルファイル操作の競合 |

### エージェント間の意見対立

| 論点 | Designer | A11y | Engineer | 結論 |
|------|----------|------|----------|------|
| 検索 debounce 時間 | 150ms が自然 | 遅延は問題なし | 300ms でパフォーマンス優先 | **推奨: 200ms**（UX とパフォーマンスのバランス） |
| Replace All 確認ダイアログ | 必要（誤操作防止） | あれば良いが必須ではない | 実装コスト低いが操作フロー増加 | **推奨: 置換件数 10件以上の場合のみ表示** |
| OutlinePanel モバイル対応 | ドロワー化 | ドロワーにも role/label 必須 | ボトムシート案も検討 | **推奨: ドロワー化**（ユーザー価値が高い） |

---

## Phase 4 品質チェック結果

### Designer チェック

- [x] H-02: ツールバーモバイル対応で xs/sm のボタン数を 50% 削減 → 手順削減
- [x] H-03: beforeunload で 1クリック確認 → 現状の「気づかずデータ喪失」から改善
- [x] H-07: 検索バーのラベル改善で「ボタンの意味を推測する」手順を削減
- [x] H-08: 初回表示でガイダンス → 「ヘルプを探す」手順を削減

### A11y チェック

- [x] キーボード操作完結: ツールバー Arrow キー実装済み、BubbleMenu に追加済み、H-02 で "More" メニューにも追加
- [x] 色のみ依存: H-04 でコントラスト改善、disabled ボタンは opacity + cursor で視覚区別
- [x] 代替テキスト: H-05（画像）、H-06（SVG 図形）で対応

### Engineer チェック

- [x] H-01: npm audit fix → M サイズ、CI チェック追加で再発防止
- [x] H-02: ツールバー改修 → M サイズ、breakpoint 分岐 + React.memo
- [x] H-03: beforeunload → S サイズ、useEffect 1つ追加
- [x] H-04: コントラスト → XS サイズ、CSS 変更のみ
- [x] H-05/H-06: alt テキスト → S サイズ、NodeView 修正
- [x] H-07: 検索バー → S サイズ、ラベル変更 + debounce 調整
- [x] H-08: オンボーディング → M サイズ、localStorage + マークダウンコンテンツ
- [x] 全改善案に見積もり付き、実行可能

---

## 使用スキル

| エージェント | 使用スキル |
|-------------|-----------|
| **Designer** | UX ヒューリスティック評価、ユーザーフロー分析、モバイルレスポンシブ評価、情報設計レビュー |
| **A11y** | WCAG 2.2 AA 準拠監査、ARIA パターン検証、キーボードナビゲーション評価、色コントラスト分析 |
| **Engineer** | 静的コード分析、依存関係監査（npm audit）、パフォーマンスプロファイリング、T-shirt sizing、アーキテクチャ評価 |
