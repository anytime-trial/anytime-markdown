# 知見テーマのオーナー表

更新日: 2026-09-23

週次調査のトピック 12（開発手法・スキルへの差分）が、知見を「どの規約・スキルと突き合わせるか」を引くための表。テーマ id は web-app の知見トラックの辞書（`packages/web-app/data/insight-timeline/themes.json`）と同じ値を使う。

Why not: オーナーを `themes.json` 側に持たせない。`themes.json` は公開 web-app に同梱されるため、`~/.claude` 配下のパスや運用規約の所在を外部へ出すことになる。消費者は本スキルだけなので、ここに置く。

## 表

オーナー欄のパスは Grep の対象。`~` はユーザーのホーム、それ以外はリポジトリルート相対。拡張同梱スキルは正本（`packages/*/skills/`）を書く。

| テーマ id | オーナー（突合する規約・スキル） |
| --- | --- |
| `subagent` | `~/.claude/CLAUDE.md`「サブエージェント」節 / `packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md` §3 |
| `context-memory` | `~/.claude/CLAUDE.md`「コンテキスト・ツール効率」「メモリ運用」節 |
| `token-cost` | `~/.claude/CLAUDE.md`「トークン・コスト効率」節 / `packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md` §3.1 |
| `model-generation` | `~/.claude/CLAUDE.md`「モデル階層化」「モデル更新時の差分レビュー」 / `packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md` §3.1 |
| `reasoning` | `~/.claude/CLAUDE.md`「effort の調整」 |
| `skills-plugins` | `packages/vscode-agent-extension/skills/anytime-dev-audit/SKILL.md` |
| `hooks-automation` | `~/.claude/settings-fragments/*.settings.json` / `packages/vscode-agent-extension/skills/anytime-dev-audit/SKILL.md` |
| `sandbox-permission` | `~/.claude/CLAUDE.md`「セキュリティ・変更制限」節 / `packages/vscode-agent-extension/skills/anytime-loop-start/SKILL.md`（子セッションの権限） |
| `security` | `~/.claude/rules/untrusted-content.md` / `.github/workflows/ci.yml`（audit ゲート） / `packages/vscode-agent-extension/skills/anytime-dev-audit/SKILL.md` |
| `review-quality` | `~/.claude/rules/pre-merge-review.md` / `~/.claude/skills/code-review-checklist/SKILL.md` |
| `testing` | `~/.claude/CLAUDE.md`「実装時」節 |
| `git-workflow` | `~/.claude/rules/git-workflow.md` |
| `ci-devops` | `.github/workflows/*.yml` |
| `spec-driven` | `AGENTS.md` / `.claude/skills/anytime-doc-authoring/SKILL.md` |
| `agent-autonomy` | `~/.claude/CLAUDE.md`「承認の対象」節 / `CLAUDE.md`「ドクトリン接地判断」節 |
| `reliability` | `~/.claude/CLAUDE.md`「委譲先の成果は委譲元が検証してから統合する」 |
| `prompting` | `~/.claude/CLAUDE.md`「応答」節 |
| `local-llm` | `packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md` |
| `competitors` | `packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md`（Codex 委譲） |
| `dev-tooling` | ルートと各パッケージの `package.json`（依存の版） / `packages/vscode-markdown-extension/skills/anytime-mermaid/SKILL.md`（mermaid） |
| `mcp` | `.mcp.json` / `CLAUDE.md`「Trail DB」節 |
| `rag-search` | 本スキルのトピック 11（Trail 機能改善提案）へ回す |
| `evaluation` / `api-sdk` / `ide-terminal` / `enterprise` / `regulation` / `labor` / `dev-culture` | オーナーなし（観測のみ。突合しない） |

## 保守

- スキルの改名・統合・正本の移動をしたら本表を同じコミットで直す。
- `themes.json` にテーマが増えたら本表にも行を足す。オーナーが無ければ「オーナーなし」の行へ加える。
