# trail-server.sh

WSL での trail-server 運用スクリプト。
`packages/trail-server/dist/cli.js` をラップして、起動・停止・状態確認・ブラウザオープン等を 1 コマンドで実行する。


## 前提

スクリプトを実行する前に `dist/cli.js` がビルド済みであること。

```bash
cd /anytime-markdown
npm run build --workspace=@anytime-markdown/trail-server
```

未ビルドの場合は `trail-server.sh` が `ERROR: cli.js が見つからない` と表示してビルドコマンドを案内する。


## PATH 登録(任意)

毎回フルパスを打つのを避けたい場合、`.bashrc` / `.zshrc` に alias を追加する。

```bash
alias trail-server='/anytime-markdown/packages/trail-server/scripts/trail-server.sh'
```

以後 `trail-server <subcommand>` で実行可能。


## サブコマンド


### `init` — 設定ファイル雛形を生成

`~/.claude/trail/config.json` の雛形を作成する。
既存ファイルがある場合は上書きせずエラー終了。

```bash
trail-server.sh init
```

生成される内容(主要キーのみ):

```json
{
  "schemaVersion": 1,
  "gitRoots": ["/anytime-markdown", "/Shared/anytime-markdown-docs"],
  "scheduler": {
    "periodicImport": { "intervalSec": 60, "runOnStart": true, "startupDelaySec": 10 }
  }
}
```


### `start` — foreground 起動

stdout にログを流しながら起動する。
Ctrl+C で SIGINT が送られ graceful 停止する。

```bash
trail-server.sh start
```

開発時の動作確認用途を想定。


### `up` — background 常駐起動

`nohup` + `disown` でバックグラウンドプロセスとして起動する。
`daemon.json` の生成を最大 10 秒 polling し、検出後に URL と PID を表示する。

```bash
trail-server.sh up
# → Started: http://127.0.0.1:47823 (pid=12345)
```

実運用での常駐用途を想定。
ログは `~/.claude/trail/logs/daemon-YYYY-MM-DD.log` に記録される。


### `status` — 起動状態の確認

`daemon.json` を読み、PID 生存確認(`kill -0`)してから結果を出力する。

```bash
trail-server.sh status
# → Running: http://127.0.0.1:47823 (pid=12345)   (exit 0)
# または
# → Not running                                    (exit 1)
# または
# → Stale daemon.json (pid not alive)              (exit 1)
```


### `stop` — graceful 停止

`SIGTERM` を送信し、最大 30 秒間プロセスの終了を待つ。

```bash
trail-server.sh stop
# → Stopping pid=12345...
# → Stopped.
```

30 秒で終了しない場合は警告を出し、手動 `kill -9 <PID>` を案内する。


### `restart` — 再起動

`stop` の後 1 秒待って `up` する。

```bash
trail-server.sh restart
```


### `open` — ブラウザで開く

`daemon.json` から URL を取り、デフォルトブラウザで開く。

```bash
trail-server.sh open
```

WSL 内では `/proc/version` を見て Microsoft を検知し、`powershell.exe Start-Process` で Windows 側のブラウザを起動する。
それ以外の環境では `xdg-open` / `open` を試行する。


### `logs` — ログ追従

当日のログファイル(`~/.claude/trail/logs/daemon-YYYY-MM-DD.log`)を `tail -f` する。

```bash
trail-server.sh logs
```

起動前に実行するとログファイル未生成のエラーになる。
`up` 後に実行する。


### `help` — ヘルプ

スクリプト冒頭のコメントを表示する。

```bash
trail-server.sh help
trail-server.sh -h
trail-server.sh --help
```


## 環境変数


| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `TRAIL_HOME` | `~/.claude/trail` | DB / 設定 / ログの保存先 |
| `TRAIL_PORT` | `0` | バインドポート(`0` で OS 任せ) |
| `TRAIL_NO_SCHEDULER` | (未設定) | `1` を設定すると `--no-scheduler` を付与し定期 ingest を無効化 |
| `TRAIL_SERVER_CLI` | `<pkg>/dist/cli.js` | `cli.js` のパス上書き(複数バージョン併用時用) |


### 例: 隔離テスト

開発中の trail-server を本番 DB と分離して試す。

```bash
TRAIL_HOME=/tmp/trail-test trail-server.sh init
TRAIL_HOME=/tmp/trail-test trail-server.sh up
TRAIL_HOME=/tmp/trail-test trail-server.sh open
TRAIL_HOME=/tmp/trail-test trail-server.sh stop
```


### 例: scheduler 無効で起動

VS Code 拡張が同じ DB に書き込み中の場合に併用したいとき。

```bash
TRAIL_NO_SCHEDULER=1 trail-server.sh up
```


### 例: 固定ポート

リバプロやトンネル経由でアクセスしたいとき。

```bash
TRAIL_PORT=47823 trail-server.sh up
```


## 注意事項


### VS Code 拡張との同時起動

VS Code 拡張機能が動いている時、両者は同じ `~/.claude/trail/trail.db` を WAL モードで参照する。
データ破損は起きないが、双方の `importAll` が同時実行されると `SQLITE_BUSY` ログが出る。

**推奨運用**:

1. 拡張機能設定 `anytimeTrail.daemon.useExternalDaemon` を `true` にして、拡張側は外部 daemon に接続するクライアントとして動作させる
2. または常駐 daemon 側を `TRAIL_NO_SCHEDULER=1` で起動して書込競合を回避する


### `node` が PATH にない場合

`nvm` などで Node を管理している場合、`nvm use` 等で `node` を有効化してから実行する。
スクリプトは `command -v node` が解決できない場合エラー終了する。


### `daemon.json` が古い場合

PID は存在するが別プロセスに再利用されている等の異常時、`status` は `Stale daemon.json (pid not alive)` を返す。
この場合は手動で `~/.claude/trail/daemon.json` を削除してから `up` する。


## トラブルシュート

| 症状 | 原因 / 対処 |
| --- | --- |
| `ERROR: cli.js が見つからない` | 未ビルド。スクリプト末尾のビルドコマンドを実行 |
| `ERROR: node が PATH にない` | nvm 利用時は `nvm use` |
| `ERROR: daemon.json が 10 秒以内に生成されなかった` | 起動失敗。`~/.claude/trail/logs/launcher-YYYY-MM-DD.log` を確認 |
| `Stopping pid=X... WARNING: 30 秒以内に停止しなかった` | analyze 等の長期処理が動いている。さらに待つか手動 `kill -9` |
| ブラウザが開かない | WSL 側で `powershell.exe` 解決に失敗。表示された URL を手動でコピー&ペースト |
