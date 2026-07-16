---
name: anytime-dev-audit
effort: medium
description: PC 環境（ディレクトリ構造）と Claude Code 設定（CLAUDE.md / rules / skills / hooks / settings / MCP / メモリ）の全レイヤーを read-only で診断し、影響度×工数マトリクスと段階的最適化プランを提示する。「セットアップ監査」「環境監査」「環境診断」「setup audit」「Claude Code 設定の診断」「/anytime-dev-audit」の指示で使用する。開発活動の健全性（Trail DB のデルタ分析・ふりかえり）は anytime-dev-retro を使う。
---

# anytime-dev-audit — セットアップ監査（Claude Code 環境の read-only 診断）

更新日: 2026-07-14

PC 環境（ディレクトリ構造＋Claude Code 設定の全レイヤー）を read-only で診断し、影響度×工数マトリクスと段階的最適化プランを提示する。`anytime-dev-retro`（Trail DB のデルタ分析・インシデント要件化）が「**開発活動**の健全性」を見るのに対し、本スキルは「**環境・設定**の健全性」を見る（2026-07-14 に `anytime-dev-health` の references から独立スキルへ分離）。初回実施と是正の実例は [20260713 監査レポート](/Shared/anytime-markdown-docs/report/20260713-claude-code-setup-audit.ja.md) / 是正プラン `plan/20260713-setup-audit-remediation.ja.md` を参照。

## 0. 大原則

- **read-only**: 診断フェーズでは変更を一切行わない。「コマンド実行禁止」は「状態を変更しないコマンド（ls / find / du / stat / git の読み取り系 / wc / grep）は可」と解釈し、その解釈を冒頭で宣言する。書き込み・削除・設定変更はプラン承認後の是正フェーズまで禁止。
- **構造のみ診断**: ディレクトリはツリーと命名のみを見る。個人ファイルの中身は開かない（設定ファイル・CLAUDE.md・SKILL.md は診断対象そのものなので読んでよい）。
- **開始前にスキャンルートを確認**: WSL 内のみ / Windows 側（/mnt/c）込み / 概要のみ、を AskUserQuestion で確定する。出力形式（チャットのみ / report ファイル可）も同時に確認する。

## 1. 診断対象（網羅チェックリスト）

| 領域 | 見るもの |
| --- | --- |
| ディレクトリ階層 | ホーム直下〜プロジェクト群の散らかり・命名不統一・深すぎ/浅すぎ・重複/放置フォルダ・置き場所の一貫性・git リポジトリ全数（ブランチ/最終コミット/90 日放置判定）・キャッシュ肥大（du） |
| CLAUDE.md | global と各プロジェクト。粒度・推定トークン（chars/4）・重複・常時ロード不要な「手続き」の混入 |
| rules/ | パススコープの妥当性。**`path:` frontmatter は機能しない**（.ts を開かないセッションでも全文ロードされることを実測済み）— glob 限定ロードを前提にした評価をしない |
| skills/ | description の発火精度（曖昧/広すぎ/狭すぎ）・本文 500 行超の肥大・スキル間重複・旧 .claude/commands/ の残骸・references/ への段階開示 |
| agents/ | 役割分担・tools の read-only 制限・model 指定・プラグイン提供分との重複 |
| hooks | PreToolUse 等のガード系の有無（観測系のみなら「強制レイヤー空洞」と判定）・フォーマッタ/通知自動化 |
| output-styles | 有無と CLAUDE.md「応答」節との二重管理リスク |
| MCP | .mcp.json と settings の enable リストの整合・未使用サーバー・権限過多。**enable リストに無くても実セッションで接続されている場合がある**ため「実接続」と突合して断定する |
| settings 各スコープ | user / project / local / managed。permissions（allow/deny/ask）と defaultMode。project 共有 settings.json の不在（local 偏重）も指摘対象 |
| プラグイン | インストール済み・マーケットプレイス・キャッシュ旧世代の GC 漏れ |
| モデル運用 | タスク別使い分け（メイン既定/サブエージェント委譲の model 明示）・effort 方針 |
| コンテキスト効率 | always-on 合計（CLAUDE.md+rules+MEMORY.md 索引）の推定トークン・/compact 運用・委譲すべき重い処理 |
| 自動化 | CI（workflows）・git hooks（pre-commit の set -e 有無まで見る）・npm scripts・スケジュール実行 |
| Git ワークフロー | コミット規約・レビュー・承認フロー・worktree 運用 |
| 日々の活用 | 反復作業のスキル化/フック化/サブエージェント化候補・「毎回言っている指示」の CLAUDE.md 移設候補 |

## 2. 実施構造（並列サブエージェント）

メイン文脈保護のため、調査は read-only サブエージェント（`model: sonnet` 明示・Explore 型）3 系統へ並列委任する:

1. **ディレクトリ構造**: ホーム/ルート直下・git 全数・du・散らかり指標。node_modules/.git/dist は prune。
2. **グローバル設定**: ~/.claude 全域（CLAUDE.md・rules・skills・agents・output-styles・settings・plugins・~/.claude.json のキー抽出のみ・memory 索引サイズ）。DB ファイルは開かない（readOnly でも WAL 書込があるため sqlite 接続禁止）。
3. **プロジェクト設定・自動化**: プロジェクト CLAUDE.md/AGENTS.md・.claude/・.mcp.json・workflows・hooks・scripts・docs リポジトリ構成。

委任プロンプトには「コンテキスト・ツール効率」ルールと read-only 制約を明記する（サブエージェントは CLAUDE.md を継承しない）。

## 3. 検証原則（サブエージェント報告の裏取り）

**サブエージェントの断定は一次証拠で裏取りしてから所見にする。** 特に是正アクションに直結する報告は必須:

- 「秘密情報がコミットされている」→ `git check-ignore -v` / `git ls-files` / `git log --all -S "<キー名>"` の 3 点で追跡状態と履歴を確認する（実例: untracked のローカル設定を「コミット済み」と誤報告し、致命→低へ訂正した）。
- 「エントリが陳腐化している」→ 意図的に残されたものでないか、周辺コメント・installer の oldSkillNames 等の再生成機構を確認する。
- 「存在しない」→ 別経路（glob 差・コロン入りファイル名・隠しディレクトリ）で再確認する。
- レポートには所見ごとに検証状態を明示し、未検証のものを是正プランに直結させない。

## 4. 出力

1. **現状マップ**: ディレクトリツリー＋設定の所在マップ（レイヤー×場所×規模の表）。
2. **問題点マトリクス**: 影響度（高/中/低）×工数（小/中/大）で優先度付けし、推奨着手順を明示。
3. **理想構成案**: (a) ディレクトリ（移動マッピング。再編不要ならそう明言する）(b) Claude Code 構成。振り分け原則は「常時必要＝CLAUDE.md／手続き＝skill／強制＝hook・permissions／隔離＝subagent」。
4. **段階的実行プラン**: フェーズ分け・各フェーズ独立承認可・破壊的操作は「対象提示→退避→承認→実行」の順序を明記。
5. **前回比デルタ**: `report/` に前回の `*-claude-code-setup-audit*` レポートがあれば、指摘の解消/残存/新規を冒頭サマリに含める（本スキルのデルタ原則を環境監査にも適用）。
6. report ファイルは `anytime-markdown-output` 書式（`type: report`）で `/Shared/anytime-markdown-docs/report/` へ。索引再生成は `npm run report:index`。

## 5. 是正フェーズの注意（承認後に別プランで実施）

- 是正は監査と別承認。3 ファイル以上はプランファイル化し、機械的タスクのみ Codex 委任（`anytime-dev-cycle` の委譲契約 6 点）。
- **Codex 委任の husky 罠**: 検証目的の `husky --version` が core.hooksPath を乗っ取る。husky 導入リポジトリへの委任契約に「husky コマンド実行禁止」を明記する。
- **hooks は即時有効**: settings.json の hooks 変更はセッション途中でも次の Bash 呼び出しから効く。ガード系フックは配線前にスタンドアロンでテストし、引用文字列（コミットメッセージ内の言及）の誤検知に注意する。
- **husky は sh(dash) でフックを実行**: `pipefail` 不可。pre-commit には `set -eu` を入れないと前段ゲートの失敗が最終行の exit 0 に上書きされる。
- 削除系は件数ログを残し、現セッションの作業領域（scratchpad 等）を除外パターンで守る。
