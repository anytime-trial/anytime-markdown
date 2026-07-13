# Codex CLI の起動作法

更新日: 2026-07-12

`codex exec` を Claude Code から起動するときの環境制約とコマンド形。委譲（`references/delegation.md` §3）とレビュー（`anytime-cross-review`）が共通で参照する。

## 起動形

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "<プロンプト>"
```

- **サブコマンドは `exec`**（非対話・headless）。対話モードは Claude からは使わない
- **`--dangerously-bypass-approvals-and-sandbox` は必須**。この環境は bwrap（bubblewrap）が使えず、Codex 既定のサンドボックス起動が失敗するため。フラグ名のとおり承認とサンドボックスを外すので、**渡すプロンプトの側で対象と変更禁止範囲を縛る**（委譲契約 6 点）
- Codex は AGENTS.md と `~/.codex/rules/*.md`（CLAUDE.md ルールのシンボリックリンク）を読む。一方 **Claude の現セッション文脈は継承しない**ため、前提はプロンプトに明示する

## 実装例

`anytime-cross-review` の `codex-review.cjs` が headless 起動のラッパである。read-only 制約・出力書式・対象 diff をプロンプト定数として強制する形になっており、スクリプト経由の定型委譲を書くときの雛形になる。

## 失敗時の切り分け

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| サンドボックス起動に失敗して即終了 | bwrap 不可の環境で既定サンドボックスを使おうとした | `--dangerously-bypass-approvals-and-sandbox` を付ける |
| 承認待ちで止まる | 対話モード（`exec` 以外）で起動した | `codex exec` を使う |
| 前提を取り違えた変更が返る | セッション文脈が継承されていない | 委譲契約 6 点（対象・変更禁止範囲・完了条件・検証・中断条件・プロンプト）を明示する |
| 検証コマンドが未定義／devDep 不足で落ちる | ホスト側の暗黙のグローバルインストールがサンドボックスに無い | 委譲前に対象 `package.json` の `scripts` と `devDependencies` の実在を確認する |
