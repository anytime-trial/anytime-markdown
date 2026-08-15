---
name: anytime-markdown-check
effort: low
description: Markdown ファイル出力後の検証。機械的な整形（空行・インデント・テーブルパイプ等）は format_markdown に委譲し、本スキルは自動化できない意味判断（コードスパン・引用・図解・ハードブレーク・階層再設計）のみを扱う。Markdown ドキュメントを出力・更新した後の検証時に使用する。
---

# Markdown 出力検証

更新日: 2026-08-14

ファイル出力後、(1) 機械的整形を `format_markdown` で適用し、(2) 自動化できない意味判断を以下のチェックリストで確認する。

---

## 1. 機械的整形（format_markdown に委譲）

見出し前後の空行（上1・下1）・箇条書き/テーブル/引用の前後空行・連続空行の圧縮（最大2）・インデントのタブ→4スペース・行末空白除去・テーブルセル内コードスパンのパイプエスケープは **`format_markdown` が決定論的に自動修正**する。手動で確認・修正しない。

- [ ] mcp-markdown の `format_markdown(path, mode="fix")` を実行する（**MCP ルート配下のファイルのみ**。ルート外は下記の代替手順へ）
- [ ] 返り値の `warnings` を確認する（下記「3. 構造」の自動修正されない項目に対応）

> [!IMPORTANT]
> `format_markdown` が操作できるのは **MCP サーバーのルート配下の `.md` だけ**。ルートは `ANYTIME_MARKDOWN_ROOT`（未設定ならサーバーの `cwd`）で決まり、anytime-markdown では `/anytime-markdown` である。\
> **`<docsRoot>`（`/Shared/anytime-markdown-docs`）はルート外**で、呼ぶと `Access denied: path outside root directory` を返す（2026-08-14 実測）。設計書・提案・レポート・レビューの出力先は大半がここなので、**ルート外が既定だと考えて手順を選ぶ**。\
> フォールバックだった `~/.claude/scripts/validate-markdown.sh` は**実在しない**（同日実測。`~/.claude/scripts/` にあるのは `agent-status-report.mjs` / `commit-tracker.sh` / `destructive-guard.sh` / `flight-review.sh` / `handoff-inject.sh` / `safe-point.sh` / `session-guard.sh` / `session-hygiene.sh` / `token-budget.sh` / `user-feedback.sh` / `verify-settings-wiring.sh` と `lib/`）。実行すると `No such file or directory` で落ちる。\
> **ルート外のファイルの検証手順**: (1) frontmatter の必須キー（`title` / `date` / `type` / `lang` ＋ type 別の必須キー）が揃っているか目視確認する、(2) 下記「2. 構文・記法」「3. 構造」のチェックリストを手動で適用する。機械的整形は適用されないため、見出し前後の空行・テーブル整形は書く時点で揃える。

## 2. 構文・記法（意味判断・手動）

`format_markdown` では判定できない。文意を読んで確認する。

- [ ] 変数名、ファイル名、ボタン名、テーブル名等のシステム固有名称がコードスパン（`` ` ``）で囲まれているか
- [ ] 補足情報が引用ブロック（`>`）で本文と分離されているか
- [ ] 複雑なロジックが Mermaid 図で図解されているか（該当する場合）
- [ ] 「。」の後に文章が続く場合、意図通りのハードブレーク／段落分けになっているか（`format_markdown` は `hardBreakAfterPeriod` で警告するのみ・自動修正しない）
- [ ] コードスパン内のバックスラッシュが不要にエスケープされていないか（リテラル扱い）

## 3. 構造（手動・再設計が必要）

機械的には修正できない。`format_markdown` は警告のみ。

- [ ] 箇条書きの深さが2階層以内か（超える場合は子見出しで再設計。`format_markdown` は `nestDepth` で警告するのみ）
- [ ] Markdown 記法文字がテーブルセルを壊していないか
