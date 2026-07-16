---
name: anytime-trail-review
effort: low
description: コードレビュー結果を出力する際の Markdown 書式（memory-core ingest パーサ対応）。### N. タイトル＋重大度/カテゴリ/対象の3メタデータ＋行頭の問題:/提案: マーカーで指摘を構造化する。レビュードキュメント・code-reviewer subagent 出力・requesting-code-review/security-review の指摘を書く時に使用する。
---

# レビュー指摘の書式

更新日: 2026-07-16

コードレビュー結果を出力する際の Markdown 書式。`memory-core/src/ingest/review` パーサ（Route A: review .md doc / Route B: session 抽出 / Route C: agent review）がこの書式を前提に finding を抽出するため、**指摘を確実に Memory に蓄積したい場合は本書式に従う**こと。

## 適用対象

| 対象 | パス・トリガー |
| --- | --- |
| レビュードキュメント | `<docsRoot>/review/<date>-<topic>.<lang>.md` |
| code-reviewer subagent 出力 | `subagent_type = 'code-reviewer'` または `subagent_type LIKE '%:code-reviewer'`（`pr-review-toolkit:code-reviewer` 等のプラグイン名前空間付きを含む）のメッセージ全文 |
| requesting-code-review skill 出力 | `skill='superpowers:requesting-code-review'` の subagent 呼び出し結果 |
| security-review / code-review-checklist | `skill IN ('security-review', 'code-review-checklist')` |

ultra-review (review-agent) は構造化 payload で別経路のため本書式の対象外。

## 1. ドキュメント全体構造

```markdown
（frontmatter — Route A の場合のみ）
---
type: "review"
title: "<タイトル>"
date: "<YYYY-MM-DD>"
reviewer: "<reviewer 名>"  # 任意。省略時は空文字
target_refs:               # 任意。レビュー対象パス
  - "packages/<pkg>/src/<file>.ts"
---

# <レビュータイトル>

## 総合評価

<PASS / FAIL / コメントなどのサマリ。指摘ではなく評価>

## レビュー指摘事項

### 1. <短いタイトル — 50 文字以内>

- **重大度**: error
- **カテゴリ**: logic
- **対象**: `packages/<pkg>/src/<file>.ts:<line>`

**問題:**

<finding 本文。何が問題か。なぜ問題か。複数段落・コードブロック可>

**提案:**

<suggestion 本文。具体的修正案。コード例があれば fenced code block で>

---

### 2. <次の指摘>

...
```

## 2. 必須ルール

### 2.1 指摘セクションの起点

- **`## レビュー指摘事項`** 見出しで指摘群を開始する（任意だが推奨）
- `## 総合評価` `## サマリー` 等の他セクションは指摘群に含めない（パーサが指摘と誤認しない設計のため）

### 2.2 個別指摘の構造

- 各指摘は **`### <N>. <タイトル>`** で開始（番号 + 半角ドット + 半角スペース + タイトル）
- メタデータ 3 行（重大度・カテゴリ・対象）は **必須**・**順序固定**
- `**問題:**` 行で finding 本文を開始
- `**提案:**` 行で suggestion 本文を開始
- 指摘間は `---` 水平線で区切る（任意・推奨）

### 2.3 マーカー記法（厳密）

| マーカー | 許容形式 |
| --- | --- |
| 問題マーカー | `**問題:**` または `**問題：**`（半角/全角コロン両対応） |
| 提案マーカー | `**提案:**` または `**提案：**` |

> [!IMPORTANT]
> マーカーは行頭に置く。インライン（文中）の `**問題:**` や `**提案:**` は finding として認識されない。

### 2.4 メタデータ値

| フィールド | 許容値 |
| --- | --- |
| `**重大度**` | `error` / `warn` / `info` |
| `**カテゴリ**` | `design` / `a11y` / `security` / `perf` / `naming` / `spec` / `logic` / `other` |
| `**対象**` | `<file path>:<line>` 形式、または symbol 名。複数対象は bullet で列挙 |

カテゴリ・重大度はパーサが自動推論もするが、明示するほうが精度が高い。

## 3. 良い例

```markdown
## レビュー指摘事項

### 1. NULL 参照の可能性 — Optional チェイン未使用

- **重大度**: error
- **カテゴリ**: logic
- **対象**: `packages/<pkg>/src/components/MemoryPanel.tsx:<line>`

**問題:**

`reader.session.user.name` の連結アクセスで `session` が null になる可能性がある。
useEffect の依存配列に `session` を入れていないため、未ロード時に呼ばれて TypeError になる。

**提案:**

Optional chaining と早期 return を使う:

\`\`\`typescript
if (!reader?.session?.user) return;
const name = reader.session.user.name;
\`\`\`

または `useEffect(() => { ... }, [reader.session])` で依存配列に追加する。

---

### 2. i18n キー未定義

- **重大度**: warn
- **カテゴリ**: naming
- **対象**: `packages/<pkg>/src/components/memory/ReviewPanel.tsx:<line>`

**問題:**

`t('memory.review.openInMessages')` を呼んでいるが、`i18n/types.ts` に定義がない。
ビルドエラーにはならないが、表示時に key 文字列がそのまま出る。

**提案:**

`types.ts` / `ja.ts` / `en.ts` の 3 ファイルに同時追加。命名規則は
`i18n-naming` スキルを参照。
```

## 4. 悪い例（パーサで取りこぼされる）

### 4.1 マーカーなしの自由形式

```markdown
### 検出 1: 重複コードの整理

- **場所**: `Logger.ts:6`
- **内容**: 同じ定数が 4 ファイルで重複定義されている
- **推奨修正**: `Logger.ts` から export して import する
```

→ `**問題:**` `**提案:**` がないため finding として認識されない。

### 4.2 絵文字 + 番号での識別

```markdown
🟡 **1. ollama-core を runtime dependencies に追加 (不要)**

テストファイルが import するだけなので devDependencies で十分。

修正: package.json から移動する。
```

→ `### N.` heading なし、マーカーなしで取りこぼし。

### 4.3 表形式のみ

```markdown
| # | 重大度 | 対象 | 内容 |
| --- | --- | --- | --- |
| 1 | error | foo.ts | NULL 参照 |
| 2 | warn  | bar.ts | i18n 未定義 |
```

→ 表のセルからは finding を抽出しない。各行を `### N.` セクションに展開する。

### 4.4 重要度サフィックス付きマーカー

```markdown
**【A11y】推奨:**

代替テキストを追加すること。
```

→ 現状パーサは `**推奨:**` を認識しない。`**提案:**` に置き換える。

## 5. 補助セクション（任意）

指摘以外の情報は別セクションに置く。パーサは見出しレベル 2 (`##`) で分割するため、`## 指摘事項` 以外の `## ...` セクションは無視される。

| セクション | 目的 |
| --- | --- |
| `## 総合評価` | PASS/FAIL の全体判定、コミット粒度、整合性など |
| `## 良い点` | 肯定的フィードバック |
| `## 補足情報` | レビュー対象の前提条件、参考リンク |
| `## 次のアクション` | 指摘以外の TODO（プロセス改善など） |

## 6. session レビュー（subagent 出力）特有のルール

`code-reviewer` subagent / `superpowers:code-reviewer` / `superpowers:requesting-code-review` skill から呼ばれた場合の出力も本書式に従う。

- セッションメッセージは Markdown だが frontmatter なし
- 出力の冒頭または末尾に `## レビュー指摘事項` を必ず含める
- 番号付き `### N. <title>` 形式を使う（heading + metadata + マーカーペア）

session 抽出は trail.messages の `text_content` 全体に対して `splitIntoChapters` を実行するため、`##` セクション分割が効く。

## 7. チェックリスト

レビュー出力時に確認:

- [ ] `## レビュー指摘事項` セクションを設置したか
- [ ] 各指摘が `### <N>. <title>` で始まっているか
- [ ] 重大度・カテゴリ・対象の 3 メタデータが順序通りに記載されているか
- [ ] `**問題:**` / `**提案:**` ペアが各指摘に含まれているか（行頭、bold 必須）
- [ ] マーカーは `:` または `：` のみ（他コロン記号禁止）
- [ ] 絵文字・表形式・自由形式マーカーを finding 識別に使っていないか
- [ ] 総合評価・良い点は `## レビュー指摘事項` 外の別セクションに置いたか

## 8. パーサ未対応形式の救済

既存の review .md で本書式に従っていないものは、書き直すか、書式変換スクリプトで `**問題:**` / `**提案:**` ペアに置換する。session 抽出済みの finding は trail.db 側の問題なので、本書式の徹底により今後の取りこぼしを防ぐ運用とする。
