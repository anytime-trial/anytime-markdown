---
id: T-3
title: GitHub リポジトリの About（Website / Description / Topics）を設定する
status: backlog
priority: medium
assignee: user
workspace: anytime-markdown
creator: Claude Code v2.1.220 (claude-opus-5[1m])
created_at: 2026-08-03T10:45:56Z
updated_at: 2026-08-03T10:45:56Z
estimate: 15
---
## 概要 (Description)

`anytime-trial/anytime-markdown` の About 欄が 3 項目とも未設定（2026-08-03 実測。
`gh api repos/...` の homepage / description / topics がいずれも null / 空）。

About の Website はリポジトリ最上部に出る外部リンクで、リリースを待たず即時に反映される。
Description と Topics は GitHub 内の検索・トピックページからの流入に効く。

AI から設定を試みたが、`gh` の fine-grained PAT に `Administration: Read and write` が
無く `Resource not accessible by personal access token`（403）で失敗した。読み取りは
通るため、書き込みを試すまで権限不足が分からない。GitHub の UI から設定する。

## 作業タスクリスト (Subtasks)

- [ ] リポジトリページ右上の About の歯車から Website に `https://www.anytime-trial.com` を設定する
- [ ] Description を設定する（Marketplace の拡張説明と揃える）
- [ ] Topics を設定する（例: markdown-editor / vscode-extension / wysiwyg / mermaid / plantuml / katex）

## 引継ぎサマリー (Handoff Notes)

## コミュニケーションスレッド (Comments)
