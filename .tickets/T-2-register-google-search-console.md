---
id: T-2
title: Google Search Console にドメインプロパティを登録する
status: up_next
priority: high
assignee: user
workspace: anytime-markdown
creator: Claude Code v2.1.220 (claude-opus-5[1m])
created_at: 2026-08-03T10:45:56Z
updated_at: 2026-08-03T10:45:56Z
dependencies:
  - T-1
estimate: 60
---
## 概要 (Description)

Search Console へ未登録のため、これまでの SEO 施策の効果を測る手段が無い。
検索パフォーマンスのデータは登録後の期間しか溜まらず遡及しないため、登録が早いほど
比較できる期間が長くなる。

手順書: `<docsRoot>/tech/search-console/search-console-setup.ja.md`

確認方式は DNS TXT のドメインプロパティ（`anytime-trial.com`）。www あり / なしと
http / https を 1 プロパティで覆え、コードにもデプロイにも依存しない。
Search Console 側の操作は AI から実行できないため担当は user。

T-1（本番デプロイ）より後に実施することを推奨する。先に登録すると sitemap に載る
URL の半分が 404 として報告される。

## 作業タスクリスト (Subtasks)

- [ ] Search Console でドメインプロパティ `anytime-trial.com` を追加する
- [ ] 表示された `google-site-verification=...` をレジストラの DNS へ TXT レコードとして追加する（ホスト名 `@`）
- [ ] `dig +short TXT anytime-trial.com` で伝播を確認してから「確認」を押す
- [ ] サイトマップに `https://www.anytime-trial.com/sitemap.xml` を送信する
- [ ] 数日後、「ページ（インデックス作成）」で 404 が出ていないこと・記法別 LP に表示回数が付き始めることを確認する

## 引継ぎサマリー (Handoff Notes)

## コミュニケーションスレッド (Comments)
