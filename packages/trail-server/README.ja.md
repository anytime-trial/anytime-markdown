# @anytime-markdown/trail-server

Anytime Trail のスタンドアロンデーモン。

## クイックスタート

```bash
npx anytime-trail-server start
# → http://127.0.0.1:<port>/ で trail-viewer にアクセス可能

npx anytime-trail-server status
npx anytime-trail-server stop
```

## 設定

`~/.claude/trail/` 配下に以下を配置 / 自動生成する。

| パス | 内容 |
| --- | --- |
| `daemon.json` | デーモンの PID / port / URL |
| `db/trail.db` | SQLite データベース |
| `logs/daemon-YYYY-MM-DD.log` | 1 日 1 ファイルの動作ログ |

環境変数 `TRAIL_HOME` を設定することで、格納先を変更できる。

## 設計

`/Shared/anytime-markdown-docs/spec/43.trail-server/trail-server.ja.md` 参照。
