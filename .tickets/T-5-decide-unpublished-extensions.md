---
id: T-5
title: Marketplace 未公開 5 拡張の扱いを決める（extension-pack の死にリンク含む）
status: backlog
priority: medium
assignee: user
workspace: anytime-markdown
creator: Claude Code v2.1.220 (claude-opus-5[1m])
created_at: 2026-08-03T10:45:56Z
updated_at: 2026-08-03T10:45:56Z
estimate: 30
---
## 概要 (Description)

Marketplace に公開されているのは 8 拡張中 3 本だけだった（2026-08-03 実測）。

| 公開済み（200） | 未公開（404） |
| --- | --- |
| anytime-markdown / anytime-trail / anytime-agent | anytime-graph / anytime-sheet / anytime-database / anytime-history / anytime-extension-pack |

これに伴う実害が 1 件ある。`packages/vscode-extension-pack/README.md` / `README.ja.md` が
含有拡張として `anytime-trial.anytime-graph` の Marketplace ページへリンクしているが、
その URL は 404 を返す。パックの内容説明そのものであり、リンクを外すとパックの説明が
実態と食い違うため、AI 側では書き換えていない。

判断が要るのは「未公開の 5 本を公開するのか、公開しないのか」。公開するなら README の
リンクはそのまま正しくなる。公開しないなら extension-pack の構成と説明を見直す必要がある。

なお `package.json` の `homepage` は 8 本すべてに追加済みで、公開時にそのまま効く。

## 作業タスクリスト (Subtasks)

- [ ] 未公開 5 本それぞれについて公開する / しないを決める
- [ ] 公開する場合: `production-release` スキルで公開し、Marketplace ページの表示を確認する
- [ ] 公開しない場合: extension-pack の README と `extensionPack` の構成を実態に合わせる
- [ ] いずれの場合も extension-pack README の anytime-graph リンクが 200 を返す状態にする

## 引継ぎサマリー (Handoff Notes)

## コミュニケーションスレッド (Comments)
