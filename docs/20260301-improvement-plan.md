# ウェブサイト改善計画

**作成日**: 2026-03-01
**レビュアー**: Designer / A11y / Engineer / Security / OSS
**対象**: packages/web-app, packages/editor-core
**ステータス**: Phase 4 完了

---

## 仮定一覧

| # | 仮定 | 影響度 |
|---|------|--------|
| A1 | デプロイ先は Vercel 等のモダンホスティング（HSTS は CDN 側で付与される前提） | 低 |
| A2 | ターゲットユーザーはデスクトップ中心、モバイルは補助的用途 | 中 |
| A3 | プロジェクトは将来的に OSS 公開の可能性がある | 高 |
| A4 | Mermaid.js の内部実装上 `unsafe-eval` の完全除去は困難 | 中 |
| A5 | 現時点でセルフホスト PlantUML サーバーの導入予定はない | 低 |

---

## Phase 1: 各エージェント分析サマリー

| 視点 | Critical/High | Medium | Low | Info |
|------|-------------|--------|-----|------|
| Security | 1 | 5 | 5 | 4 |
| OSS | 2 (High) | 2 | 1 | 2 |
| Designer | 3 (High) | 7 | 5 | - |
| A11y | 4 (高) | 9 | 10 | - |
| Engineer | 1 (High) | 6 | 10 | - |

---

## Phase 2: 統合課題一覧（優先度付き）

重複を統合し、**ユーザー影響度 x 改善コスト** で優先度を判定。

### 高優先

| ID | 課題名 | 視点 | コスト | 根拠 |
|----|--------|------|--------|------|
| H-1 | 操作フィードバック通知システムの導入 | Designer | S | 保存/コピー/エラーの通知なし。データ消失リスクあり |
| H-2 | LICENSE ファイル + サードパーティライセンス表示 | OSS | S | 法的リスク。MIT/BSD/Apache 全てが表示義務を持つ |
| H-3 | CSP の段階的厳格化 | Security | M | `unsafe-eval` + `unsafe-inline` で CSP が実質無効 |
| H-4 | HTML サニタイズを許可リスト方式に変更 | Security | XS | FORBID_ATTR 拒否リストが 6 属性のみ。200+ のイベントハンドラが未遮断 |
| H-5 | Image/Table 全画面のフォーカストラップ + Escape | A11y | S | キーボードユーザーがフォーカスを失い操作不能になる |
| H-6 | Diff/BubbleMenu の色のみ依存を解消 | A11y | S | 赤緑色覚の利用者が追加/削除・書式状態を識別不能 |

### 中優先

| ID | 課題名 | 視点 | コスト |
|----|--------|------|--------|
| M-1 | Mermaid `securityLevel: "strict"` 明示 | Security | XS |
| M-2 | ARIA 一貫性の確保（toolbar role, aria-label, aria-pressed） | A11y | S |
| M-3 | i18n ギャップ解消（見出しラベル、NodeView ラベル、404、OutlinePanel） | Designer+A11y | S |
| M-4 | 500行超ファイルの分割（MermaidNodeView 706行、EditorToolbar 697行） | Engineer | M |
| M-5 | ESLint 設定の追加 | Engineer | S |
| M-6 | OGP メタデータの追加 | Engineer | XS |
| M-7 | PDF エクスポートのローディング表示 | Designer | XS |
| M-8 | `any` 型の解消（14箇所） | Engineer | S |
| M-9 | SlashCommand のスクリーンリーダー関連付け | A11y | S |
| M-10 | sw.js デバッグビルドの .gitignore 追加 | Security | XS |
| M-11 | package.json に license フィールド追加 | OSS | XS |
| M-12 | PlantUML fetch レスポンスの検証 + サニタイズ | Security | XS |
| M-13 | PWA maskable アイコン追加 | Engineer | XS |
| M-14 | 全画面 textarea / ダイアグラムスプリッターのキーボード操作 | A11y | S |

### 低優先

| ID | 課題名 | 視点 | コスト |
|----|--------|------|--------|
| L-1 | ツールバーボタン密度の改善（サブメニュー化） | Designer | M |
| L-2 | タブレット向け中間レイアウト追加 | Designer | M |
| L-3 | テストカバレッジ拡充（91 ファイル中 25 のみ） | Engineer | XL |
| L-4 | ターゲットサイズの最小保証（24x24 CSS px） | A11y | S |
| L-5 | 確認ダイアログアイコンの一貫性 | Designer | XS |
| L-6 | Capacitor ビルドの CSP 設定 | Security | S |
| L-7 | robots.txt / sitemap.xml 追加 | Engineer | XS |
| L-8 | localStorage 設定値のスキーマバリデーション | Security | S |
| L-9 | HelpDialog の DOMPurify 設定厳格化 | Security | XS |
| L-10 | marked の動的インポート化 | Engineer | XS |
| L-11 | リサイズインジケーターのダークモード対応 | A11y | XS |
| L-12 | PWA screenshots / shortcuts / categories 追加 | Engineer | S |
| L-13 | 比較モードのモバイルアクセス | Designer | S |
| L-14 | HSTS ヘッダー追加 | Security | XS |
| L-15 | HTML プレビュー領域の role="document" 追加 | A11y | XS |

---

## Phase 3: 高優先課題の改善案

### H-1: 操作フィードバック通知システムの導入

**【Designer】現状**: 保存・コピー・インポートの成功/失敗通知が一切ない。`copiedToClipboard` i18n キーは定義済みだが未使用。ファイル操作の async エラーも try-catch なしで握りつぶされている。

**改善案**:
1. `MarkdownEditorPage` に MUI Snackbar を追加し、共有の通知 state を管理
2. `useEditorFileOps` の各 async 操作に try-catch を追加
   - `AbortError`（ユーザーキャンセル）→ 無視
   - その他のエラー → エラートースト表示
3. 保存成功 → `t("fileSaved")` トースト（2秒）
4. コピー成功 → `t("copiedToClipboard")` トースト（2秒）

**【A11y】レビュー**:
- 必須: Snackbar に `role="status"` `aria-live="polite"` を付与すること（MUI Snackbar はデフォルトで対応済み）
- 推奨: エラー通知は `aria-live="assertive"` にする

**【Engineer】レビュー**:
- 推奨: 通知 state は Context ではなく `useEditorFileOps` の戻り値に `notification` を追加し、`MarkdownEditorPage` でのみ消費する方がシンプル
- 工数: **S**（1-2日）

---

### H-2: LICENSE ファイル + サードパーティライセンス表示

**【OSS】現状**: リポジトリに LICENSE ファイルなし。package.json にも license フィールドなし。MIT/BSD/Apache 依存パッケージ 50+ が著作権表示義務を持つが、表示ページが存在しない。

**改善案**:
1. リポジトリルートに `LICENSE` ファイル（MIT）を追加
2. ルート + 各パッケージの `package.json` に `"license": "MIT"` を追加
3. ビルド時に `license-checker --production --json` で一覧を自動生成
4. ヘルプダイアログまたはバージョン情報に「オープンソースライセンス」リンクを追加

**【Engineer】レビュー**:
- 推奨: `scripts` に `"licenses": "license-checker --production --csv > THIRD_PARTY_LICENSES.csv"` を追加し、リリース手順に組み込む
- 工数: **S**（1日）

**【Designer】レビュー**:
- 推奨: バージョン情報ダイアログ内に「Open Source Licenses」リンクを配置するのが自然

---

### H-3: CSP の段階的厳格化

**【Security】現状**: `script-src 'self' 'unsafe-eval' 'unsafe-inline'` で CSP が実質無効。`unsafe-eval` は Mermaid.js が必要、`unsafe-inline` は Next.js のインラインスクリプトが必要。

**改善案**:
1. **Phase A**: `Content-Security-Policy-Report-Only` で nonce ベース CSP を検証
2. **Phase B**: Next.js の `nonce` サポート (`experimental.sri`) で `unsafe-inline` を除去
3. **Phase C**: Mermaid の `securityLevel: "strict"` を明示し、`unsafe-eval` 除去を試行。不可能な場合は `strict-dynamic` + nonce で緩和
4. `worker-src 'self'` を追加

**【Engineer】レビュー**:
- 必須: Phase A の Report-Only で本番影響を確認してから Phase B に進むこと
- 質問: Next.js 15 の `nonce` サポートの安定性は確認済みか？→ 仮定 A4 に基づき段階的に進める
- 工数: **M**（3-5日、段階的）

**【A11y】レビュー**: CSP 変更は a11y に影響なし。対応不要。

---

### H-4: HTML サニタイズを許可リスト方式に変更

**【Security】現状**: `FORBID_ATTR` で 6 イベントハンドラのみ拒否。`onmouseenter`, `onkeydown` 等 200+ が未遮断。

**改善案**:
```typescript
const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img', 'br', 'hr', 'strong', 'em', 'code', 'pre',
    'form', 'input', 'select', 'option', 'textarea', 'button', 'label',
    'details', 'summary', 'blockquote', 'figure', 'figcaption',
    'nav', 'header', 'footer', 'main', 'section', 'article'],
  ALLOWED_ATTR: ['class', 'style', 'id', 'href', 'src', 'alt', 'title',
    'type', 'name', 'value', 'placeholder', 'for', 'colspan', 'rowspan',
    'width', 'height', 'target', 'rel'],
};
```

**【Designer】レビュー**:
- 質問: `style` 属性を許可すると CSS injection のリスクはないか？→ DOMPurify はデフォルトで危険な CSS プロパティ（`expression()`, `url()` with `javascript:`）をサニタイズするため許容可能
- 推奨: HTML サンプルのプリセットが許可タグ/属性の範囲内で動作することを検証する

**【Engineer】レビュー**:
- 工数: **XS**（数時間）。設定オブジェクトの変更のみ

---

### H-5: Image/Table 全画面のフォーカストラップ + Escape

**【A11y】現状**: `position: fixed` + `zIndex: 1300` のカスタム実装。フォーカストラップなし、Escape キー非対応。`DiagramFullscreenDialog` は MUI Dialog で正しく対応済み。

**改善案**:
1. Image/Table の全画面表示を MUI Dialog に置き換える
   - 既に `DiagramFullscreenDialog` で同パターンが実装済みなので、それを踏襲
2. `role="dialog"` `aria-modal="true"` `aria-label` を付与
3. Escape キーで閉じる機能を追加

**【Designer】レビュー**:
- 必須: 全画面→通常への復帰時に、元のブロック位置にフォーカスが戻ること
- Designer 品質チェック: MUI Dialog 化により全画面表示の開閉が1ステップで完結（現状と同等）→ パス

**【Engineer】レビュー**:
- 推奨: `FullscreenDialog` 共通コンポーネントを作成し、Image/Table/Diagram で再利用する
- 工数: **S**（1-2日）

---

### H-6: Diff/BubbleMenu の色のみ依存を解消

**【A11y】現状**: Diff は `success.main`（緑）/`error.main`（赤）の背景色のみで追加/削除を区別。BubbleMenu のアクティブ状態は `color="primary"` の色変更のみ。

**改善案**:
1. **Diff**: 行頭に `+` / `-` 記号を追加表示。ガター列にアイコン（`AddIcon` / `RemoveIcon`）を配置
2. **BubbleMenu**: アクティブ状態のボタンに `bgcolor` 変更を追加（`action.selected` + `aria-pressed={true}`）

**【Designer】レビュー**:
- 必須: Diff の `+` / `-` 記号は行番号ガター内に配置し、テキスト領域を圧迫しないこと
- 推奨: BubbleMenu は MUI の `selected` スタイル（薄い背景色）を使えば視覚的にも改善される

**【Engineer】レビュー**:
- Diff の記号追加は `MergeEditorPanel` の行レンダリング部分の変更。BubbleMenu は sx prop の追加
- 工数: **S**（1-2日）

---

## Phase 4: 品質チェック

### 【Designer】改善後のフロー検証

| チェック項目 | 結果 |
|------------|------|
| H-1: 保存フローが現状より手順削減されているか | パス: 手順数は変わらないが、フィードバック追加で操作確認が不要になり認知負荷が削減 |
| H-5: 全画面表示の開閉が現状と同等か | パス: MUI Dialog 化しても開閉は1ステップ |
| H-6: BubbleMenu の操作手順に変更がないか | パス: 視覚的フィードバックの追加のみ、操作は変更なし |

### 【A11y】アクセシビリティ検証

| チェック項目 | 結果 |
|------------|------|
| H-1: 通知がスクリーンリーダーに伝達されるか | パス: MUI Snackbar は `role="status"` 対応済み |
| H-5: キーボード操作完結か | パス: MUI Dialog のフォーカストラップ + Escape |
| H-6: 色のみ依存が解消されているか | パス: 記号 + 背景色変更で複数の手がかり |
| H-4: 代替テキスト不備がないか | 対象外（サニタイズ設定変更のため） |

### 【Engineer】実行可能性検証

| ID | 改善案 | 見積もり | 実行可能か |
|----|--------|---------|-----------|
| H-1 | Snackbar 通知システム | S (1-2日) | 可: MUI Snackbar + useEditorFileOps の try-catch 追加 |
| H-2 | LICENSE + ライセンス表示 | S (1日) | 可: ファイル追加 + license-checker スクリプト |
| H-3 | CSP 段階的厳格化 | M (3-5日) | 可: Report-Only から段階的に。ただし Mermaid の eval 依存は要調査 |
| H-4 | サニタイズ許可リスト | XS (数時間) | 可: 設定オブジェクトの変更のみ |
| H-5 | 全画面フォーカストラップ | S (1-2日) | 可: DiagramFullscreenDialog の実装パターンを踏襲 |
| H-6 | 色のみ依存解消 | S (1-2日) | 可: sx prop と行レンダリングの変更 |

**全項目パス。**

---

## 実装ロードマップ

### Sprint 1（即時対応）: XS コスト [完了]
- [x] H-4: HTML サニタイズ許可リスト化
- [x] M-1: Mermaid securityLevel 明示
- [x] M-6: OGP メタデータ追加
- [x] M-10: sw.js の .gitignore 追加（既存 .gitignore でカバー済み）
- [x] M-11: package.json license フィールド追加
- [x] M-12: PlantUML img referrerPolicy 追加

### Sprint 2（短期）: S コスト [完了]
- [x] H-1: 通知システム導入
- [x] H-2: LICENSE + サードパーティライセンス表示
- [x] H-5: 全画面フォーカストラップ
- [x] H-6: 色のみ依存解消
- [x] M-2: ARIA 一貫性確保
- [x] M-3: i18n ギャップ解消

### Sprint 3（中期）: M コスト
- H-3: CSP 段階的厳格化
- M-4: 500行超ファイル分割
- [x] M-5: ESLint 設定追加
- M-7: PDF エクスポートローディング表示
- [x] M-8: any 型解消

### Backlog（長期）
- L-1 ~ L-15: 低優先課題
- L-3: テストカバレッジ拡充（XL、継続的に実施）
