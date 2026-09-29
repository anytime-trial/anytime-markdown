# Codex CLI の起動作法

更新日: 2026-09-29

`codex exec` を Claude Code から起動するときの環境制約とコマンド形。委譲（同ディレクトリの `delegation.md` §3）とレビュー（`anytime-cross-review`）が共通で参照する。

## 起動形

```bash
timeout --kill-after=60 5400 codex exec --dangerously-bypass-approvals-and-sandbox -m <slug> -c model_reasoning_effort=<level> "<プロンプト>" < /dev/null
```

- **`timeout --kill-after=60 5400`（壁時計 90 分）で包む（必須）**。サンドボックスと承認を外して走らせるため、暴走（子エージェントの増殖・ループ）を止める外側の仕組みが他に無い。特にバックグラウンド実行は Bash ツールの 10 分タイムアウトも効かず、無期限に走り得る（2026-07 に OpenAI Codex の 1 プロンプトが子エージェント 826 個を起動して $78,000 を消費した事案が根拠）。終了コード 124（SIGKILL 昇格時は 137）は時間上限による打ち切りであり、結果は検証せず捨て、作業を分割して委譲し直すか Claude 側で実施する。90 分を超える見込みの作業は委譲前に分割する。上限値は `anytime-loop-start` の子セッション上限（90 分）と揃えている

- **`-m <slug>` と `-c model_reasoning_effort=<level>` を毎回付ける**。値は作業に応じて dev-cycle `SKILL.md` §3.1 の表から引く（例: 定型実装は `-m gpt-6-sol -c model_reasoning_effort=low`）。省略すると `~/.codex/config.toml` の既定で走り、作業に見合わない段のモデルが選ばれる

- **`< /dev/null` で stdin を閉じる（必須）**。閉じないと `codex exec` は `Reading additional input from stdin...` で**永久にブロックする**。Claude Code の Bash ツールは stdin をパイプで開いたまま渡すため EOF が来ない。前景実行では 10 分のタイムアウトで、バックグラウンド実行では無限に、いずれも**ファイルを 1 つも書かずに沈黙する**（2026-07-13 実測。「Codex が遅い」に見えるが実際は入力待ち）
- **サブコマンドは `exec`**（非対話・headless）。対話モードは Claude からは使わない
- **`--dangerously-bypass-approvals-and-sandbox` は必須**。この環境は bwrap（bubblewrap）が使えず、Codex 既定のサンドボックス起動が失敗するため。フラグ名のとおり承認とサンドボックスを外すので、**渡すプロンプトの側で対象と変更禁止範囲を縛る**（委譲契約 6 点）
- Codex が読む指示ファイルはリポジトリの `AGENTS.md`（と存在すれば `~/.codex/AGENTS.md`）だけ。`~/.codex/rules/` は実行許可ルールで指示ファイルではなく、CLAUDE.md・`~/.claude/rules/` は読まれない（2026-09-13 実測）。**Claude の現セッション文脈も継承しない**ため、前提はプロンプトに明示する
- **husky 導入リポジトリでは「husky コマンドの実行禁止」を委任プロンプトに明記する**。Codex が検証目的で `husky --version` を実行すると、husky v9 が「--version」を init ディレクトリ引数と解釈して `core.hooksPath` を `--version/_` に書き換え、リポジトリ直下に `--version/` を生成し、以後の commit が `sh: 0: Illegal option --` で失敗する（2026-07-13 実例）。復旧は `git config core.hooksPath '.husky/_'` と残骸ディレクトリの削除

## 実装例

`anytime-cross-review` の `codex-review.cjs` が headless 起動のラッパである。read-only 制約・出力書式・対象 diff をプロンプト定数として強制する形になっており、スクリプト経由の定型委譲を書くときの雛形になる。

## 失敗時の切り分け

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 何も出力せず延々と待つ（ログ末尾が `Reading additional input from stdin...`） | stdin が開いたままで EOF が来ず、追加入力を待ち続けている | `< /dev/null` を付ける。**「Codex が遅い」と誤診しやすい**（タイムアウトを延ばしても直らない） |
| 終了コード 124 / 137 で終わる | `timeout` の 90 分上限で打ち切られた | 結果は検証せず捨てる。作業を分割して委譲し直すか Claude 側で実施する。同じプロンプトで再実行しない |
| サンドボックス起動に失敗して即終了 | bwrap 不可の環境で既定サンドボックスを使おうとした | `--dangerously-bypass-approvals-and-sandbox` を付ける |
| 承認待ちで止まる | 対話モード（`exec` 以外）で起動した | `codex exec` を使う |
| モデル指定で即終了する | slug が廃止・改名された | `~/.codex/models_cache.json` の `models[].slug` を確認し、対応表の更新をユーザーへ提案する。近い段へ黙って差し替えない |
| 前提を取り違えた変更が返る | セッション文脈が継承されていない | 委譲契約 6 点（対象・変更禁止範囲・完了条件・検証・中断条件・プロンプト）を明示する |
| 検証コマンドが未定義／devDep 不足で落ちる | ホスト側の暗黙のグローバルインストールがサンドボックスに無い | 委譲前に対象 `package.json` の `scripts` と `devDependencies` の実在を確認する |
