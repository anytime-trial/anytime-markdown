# スタック上書きルール

5 問インタビュー Q4 の回答に基づいて、デフォルトの T3 Stack を上書きする分岐ルール。


## 1. 判定マトリクス

| Q4 回答 | 分岐先 | 適用変更 | 初期リリース対応 |
| --- | --- | --- | --- |
| 無し / `T3 で` | `stacks/t3-default.md` + `stacks/_frontend-next.md` | 変更無し | ◯ |
| `Python BE で` | `stacks/python-be.md` + `stacks/_frontend-next.md` | frontend/ + backend/ 並列、FastAPI + SQLAlchemy + Alembic、Auth.js + JWT 検証、OpenAPI 自動生成 | ◯ |
| `Hono BE で` | `stacks/hono-be.md`（将来） | tRPC を Hono REST に差し替え | × 未対応 |
| `Rails で` | `stacks/rails-hotwire.md`（将来） | T3 全体を Rails + Hotwire に差し替え | × 未対応 |
| その他 | T3 デフォルトで続行 | ユーザに「未対応スタックです。T3 デフォルトで進めますか?」確認 | ◯ |


## 2. 初期リリースの方針（YAGNI）

本リリースでは `t3-default` と `python-be` を実装する。\
`hono-be` / `rails-hotwire` は使用実績が出てから追加する。

未対応スタックを Q4 で選んだ場合は SKILL.md の Phase 1.5 で以下のメッセージを出してユーザに確認する。

```text
指定されたスタック「<Q4 回答>」は本スキルの初期リリースで未対応です。
T3 Stack デフォルトで進めて良いですか? (y/N)
```

`N` の場合は処理を中断し、対応スタック追加リクエストとしてユーザに通知する。


## 3. 将来追加時の手順

新スタックを追加する場合の手順を残す。

1. `stacks/<stack-name>.md` を新規作成し、`t3-default.md` 同等の構成を記述
2. 本ファイルの判定マトリクスの該当行を「◯ 対応」に更新
3. SKILL.md の Phase 4 分岐に新スタック処理を追記
4. 手動 E2E テストで動作確認
