---
id: T-4
title: [locale] 配下の notFound() が HTTP 200 を返すソフト 404 を解消する
status: backlog
priority: medium
assignee: agent
workspace: anytime-markdown
creator: Claude Code v2.1.220 (claude-opus-5[1m])
created_at: 2026-08-03T10:45:56Z
updated_at: 2026-08-03T10:45:56Z
estimate: 180
---
## 概要 (Description)

`app/[locale]/` 配下のルートで `notFound()` を呼ぶと、404 ページは描画されるが
HTTP ステータスが 200 のまま返る（ソフト 404）。検索エンジンは存在しないページを
「中身のある 200」として扱うため、インデックスの汚染とクロール予算の浪費になる。

実測（2026-08-03、`next start` 本番ビルド）:

| パス | ステータス |
| --- | --- |
| `/markdown/unknown` | 200（404 ページを描画） |
| `/en/markdown/unknown` | 200 |
| `/report/no-such-slug` | 200 |
| `/en/no-such-page` | 404（ルート未一致なので Next の既定 404） |

ルートに一致したうえで `notFound()` を呼ぶ経路だけが 200 になる。next-intl の
middleware が rewrite した先の 404 がステータスとして伝わっていないと見ている。
`dynamicParams = false` を足しても変わらないことは実測済み（no-op のため revert した）。

`[locale]` 配下の全ルートに共通する既存の挙動で、記法別 LP に固有の問題ではない。

## 作業タスクリスト (Subtasks)

- [ ] 再現するリグレッションテストを先に用意する（実サーバーへ curl してステータスを見る形。ユニットでは再現しない）
- [ ] 原因を切り分ける（next-intl の rewrite / proxy.ts の応答生成 / Next のバージョン挙動）
- [ ] 修正方針を 2 案（ベストプラクティス案 / 安定性優先案）で提示して選択を仰ぐ
- [ ] 修正後、上表の 4 パスすべてで期待どおりのステータスになることを実測する

## 引継ぎサマリー (Handoff Notes)

## コミュニケーションスレッド (Comments)
