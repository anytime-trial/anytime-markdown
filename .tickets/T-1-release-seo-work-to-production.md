---
id: T-1
title: SEO 施策一式を本番へ出す（web-app デプロイ + 拡張公開）
status: up_next
priority: high
assignee: user
workspace: anytime-markdown
creator: Claude Code v2.1.220 (claude-opus-5[1m])
created_at: 2026-08-03T10:45:56Z
updated_at: 2026-08-03T10:45:56Z
estimate: 120
---
## 概要 (Description)

2026-08-02〜03 の SEO 施策 5 件が develop に溜まっており、本番へ出るまで 1 つも効かない。

develop にあるが未デプロイのもの:

- metadata 整備（canonical / hreflang / sitemap / robots）`095fcfc54`
- ロケール URL 分離（`/en` 配下）`cfa88dacd`
- `/markdown` へのサーバー描画本文追加 `197ccd30d`
- 記法別ロングテール LP 5 本 `2a52453eb`
- 被リンク経路の整備（Marketplace の homepage / README）`106989d1b`
- robots.txt と sitemap の共通ソース化 `c9c7570ba`

実測（2026-08-03）: 本番では `/markdown/mermaid` 等 5 本と `/en/**` 全体が 404 を返す。
README と Marketplace に書いたリンクも、この URL 群を指しているため同時に死んでいる。

web-app は Netlify の master 連動でデプロイされる。拡張機能の Marketplace 更新も
同じリリースに含まれるため、リンクとリンク先は同時に世に出る。

手順は `production-release` スキルに従う。

## 作業タスクリスト (Subtasks)

- [ ] develop → master の PR を作成し、CI（横断ビルド・audit・Netlify デプロイチェック）を通す
- [ ] 本番デプロイ後、`/markdown/{mermaid,plantuml,katex,diff,table}` と `/en/**` が 200 を返すことを curl で実測する
- [ ] `https://www.anytime-trial.com/sitemap.xml` と `/robots.txt` が新しい 20 URL を含むことを確認する
- [ ] 拡張機能を Marketplace へ公開し、Resources 欄に Homepage リンクが出ることを確認する

## 引継ぎサマリー (Handoff Notes)

## コミュニケーションスレッド (Comments)
