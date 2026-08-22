# スタック固定の方針

本スキルが生成するスタックは **Next.js（T3 Stack）固定**で、インタビューにスタック選択の質問を置かない。


## 1. 固定スタック

| 項目 | 値 |
| --- | --- |
| 適用手順 | `stacks/_frontend-next.md` + `stacks/t3-default.md` |
| 構成 | Next.js + tRPC + Prisma + Tailwind + NextAuth + Postgres |
| 上書き | 受け付けない（Hono BE / Rails / Python BE いずれも非対応） |

ユーザが別スタック（`Python BE で` 等）を要求した場合は、要求を受けた時点で\
「本スキルは Next.js 専用です。T3 Stack で進めますか?」を `AskUserQuestion` で 1 回だけ確認し、\
否なら中断して対応スタック追加リクエストとしてユーザに通知する。


## 2. Python BE（FastAPI）を外した経緯

2026-08-22 にユーザ指示で Next.js 専用化し、`stacks/python-be.md` と\
`scaffold/python-be-files/` を削除した。復元が必要な場合は git 履歴から取得する\
（削除コミット: 件名 `feat(anytime-build-webapp): --devcontainer 生成オプションを追加し Next.js 専用スキルへ絞る`。\
`git log --diff-filter=D -- .claude/skills/anytime-build-webapp/stacks/python-be.md` で辿れる）。


## 3. 将来追加時の手順

新スタックを追加する場合の手順を残す。

1. `stacks/<stack-name>.md` を新規作成し、`t3-default.md` 同等の構成を記述
2. 本ファイル第 1 章の「上書き」欄を更新し、選択肢を持たせるなら `questions.md` へ質問を追加
3. SKILL.md の Phase 4 分岐に新スタック処理を追記
4. 手動 E2E テストで動作確認
