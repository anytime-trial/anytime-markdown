---
name: anytime-cross-review
effort: medium
description: develop マージ前に Claude(pr-review-toolkit:code-reviewer subagent)と Codex(codex exec review)が同一 diff を独立レビューし、互いの指摘を検証(adversarial cross-check)して合意指摘を採用する相互レビュー。指摘は review doc + trail memory_reviews に記録する。「相互レビュー」「cross review」「/anytime-cross-review」「Claude Codex レビュー」「二者レビュー」の指示で使用する。
---

# anytime-cross-review — Claude × Codex 相互レビュー

更新日: 2026-07-16

develop マージ前の品質ゲートを Claude と Codex の**二者独立レビュー＋相互検証**へ拡張する。設計は `<docsRoot>/plan/20260623-codex-cross-review-design.ja.md`。

- **適用範囲**: 高重大度の変更（定義は `anytime-dev-cycle` SKILL.md 冒頭）。実装と同一基盤モデルだけで検証すると欠陥を共有し、AI レビュアー自身が騙され得る（cognitive monoculture / verification subversion）ため、実装とは別系統モデル（Codex）による独立検証を行う。`anytime-dev-cycle` 段6 は高重大度のとき本スキルを選択する。それ以外の変更は `superpowers:requesting-code-review` でよい。
- 対象: 作業ブランチ → develop の diff（`<base>..HEAD`・既定 base=develop）。
- 同梱ラッパ: `.claude/skills/anytime-cross-review/codex-review.cjs`（Codex review を headless 起動・read-only ガード付き）。
- Codex CLI の起動作法・環境制約（bwrap 不可のため `--dangerously-bypass-approvals-and-sandbox` 必須）は `.claude/skills/anytime-dev-cycle/references/codex-cli.md` を参照する（委譲系と共通）。
- 起動: `/anytime-cross-review [base]`、または `anytime-dev-cycle` 段6 が高重大度と判定したときの選択。global `~/.claude/rules/pre-merge-review.md`（全マージへの一律適用）への統合は本スキル対象外。

## 手順

### 0. 前提

- DB ingest はラグ（数十分〜Reload）を伴うため、**ゲート判定はその場の統合サマリで行う**。trail 記録は事後の因果追跡用。
- Codex 実行は bwrap 不可環境のため `--dangerously-bypass-approvals-and-sandbox`（ラッパが付与）。レビューは read-only。

### 1. diff 確定

`git diff <base>...HEAD --stat` で対象を確認する（既定 base=develop）。3 点（`...`）は merge-base からの差分で、ブランチ作成後に develop が進んでも develop 側の変更を混ぜない（作業ブランチが加えた変更のみ）。

### 2. Round 1 — 独立デュアルレビュー（並行）

- **Claude**: `pr-review-toolkit:code-reviewer` subagent に diff レビューを依頼する（`anytime-trail-review` 出力。`superpowers:requesting-code-review` と同様、subagent session 経由で memory_reviews に ingest され reviewer=`pr-review-toolkit:code-reviewer`）。
- **Codex**: `node .claude/skills/anytime-cross-review/codex-review.cjs --base <base>` を実行する。
  - stdout = レビュー本文（`### N.` 形式・bold マーカー）、stderr に `findings=N maxSeverity=...`。
  - exit 0 = 成功 / 2 = codex 失敗（非ゼロ終了・timeout）/ 3 = read-only 逸脱（codex がファイルを変更）。
  - **exit 2 のみ degrade**: Claude 単独レビューで続行し、統合サマリに「Codex レビュー欠落（理由）」を明記（グレースフルデグラデーション）。
  - **exit 3 は中断**: read-only 逸脱は重大。続行せず `git status` で混入を確認し復元してから再開する（degrade 対象にしない）。

### 3. Round 2 — 相互検証（adversarial）

- **Claude が Codex 指摘を検証**: Codex の各指摘を real / false-positive / 要追加情報 に分類する（diff を持つ Claude が判定）。
- **Codex が Claude 指摘を検証**: Claude 指摘を列挙し「各指摘を confirm / refute し、結果を `<<<CROSS-REVIEW-START>>>` / `<<<CROSS-REVIEW-END>>>` で挟んで出力。ファイル変更禁止(read-only)」と指示するプロンプトを作り、`node .claude/skills/anytime-cross-review/codex-review.cjs --verify`（stdin にプロンプトを渡す）で実行する。**Round 1 と同じ before/after fingerprint ガード下で走る**ため、検証中の read-only 逸脱（exit 3）も検出できる。exit 2 は degrade。

### 4. 記録

- **ブランチ名の正規化**: `<branch>` は `feature/...` 等 slash を含むため、ファイル名用に `git rev-parse --abbrev-ref HEAD | tr '/ ' '--'` で `<branch-slug>` に正規化してから使う（slash のままだと review doc がサブディレクトリ扱いになり命名規約・ingest 対象から外れる）。
- **Codex 指摘** → `<docsRoot>/review/<YYYYMMDD>-<branch-slug>-codex.ja.md` を作成:
  - frontmatter: `title` / `date` / `type: review` / `lang: ja` / `reviewer: codex` / `severity: <maxSeverity>`（ラッパ stderr の値）。
  - 本文: codex-review.cjs の stdout（`anytime-trail-review`）。`anytime-markdown-output` 準拠。
  - `bash ~/.claude/scripts/validate-markdown.sh <file>` で検証 → `review_incremental` が `parseReviewDoc` で ingest（source_kind=review_doc・reviewer=codex）。
- **件数突合**: ラッパが報告した `findings=N` と review doc 内の `### N.` 件数が一致することを確認する。不一致は format drift の兆候 → 統合サマリに警告。
- **Claude 指摘** は subagent session 経由で ingest 済み（追加作業なし）。

### 5. 統合 → ゲート

- 合意集合（双方が挙げた / 一方が挙げ他方が confirm）と係争（一方が挙げ他方が refute）を分類する。
- `<docsRoot>/review/<YYYYMMDD>-<branch-slug>-cross-review.ja.md`（`type: report`・`<branch-slug>` は上記正規化）に出力: サマリ / 合意指摘（採用） / 係争（人手判断） / 採用アクション。**finding は再 ingest しない**（重複防止のため review でなく report）。
- 採用した error / warn を解消してから develop へマージする（マージ・コミットは Claude が実施。Codex には委任しない）。

### 6. ガードレール

- Codex は read-only。exit 3（ファイル変更検出）は逸脱として**中断**し、`git status` で混入を確認・復元する。
- Codex 失敗・タイムアウトは Claude 単独で継続し degrade をサマリに明記（silent に握りつぶさない）。
- ラッパ/スキルのエラーは識別子付きでログ（silent catch 禁止）。
- anytime-trail-review 逸脱で Codex 指摘が取りこぼされうる（件数突合で検知）。
- **read-only ガードの既知制限**: fingerprint は `git status --porcelain` + `git diff HEAD` + 未追跡ファイル内容。`.gitignore` 対象パス（`node_modules/`・`dist/`・ログ等）や `.git` 外を指す symlink 先への書き込みは fingerprint 対象外で検出できない。レビュー用途のリスク許容範囲だが、機密パスを含む環境では実行前に worktree を clean にすることを推奨。

## テスト

ラッパの純ロジックは `node --test .claude/skills/anytime-cross-review/codex-review.test.cjs`（jest 不要）。E2E は小 diff に対し本手順を手動実行し、Codex review doc の ingest（memory_reviews に reviewer=codex 行）を Reload 後に確認する。
