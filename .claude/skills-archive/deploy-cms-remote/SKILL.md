---
name: deploy-cms-remote
description: mcp-cms-remote (Cloudflare Workers) のデプロイ手順ガイド。「cms-remoteをデプロイ」「Workersをデプロイ」「MCPリモートサーバーをデプロイ」「cms-remoteを更新」などの指示で使用する。
---

# mcp-cms-remote デプロイ

更新日: 2026-06-29

Cloudflare Workers 上の MCP リモートサーバー（mcp-cms-remote）のデプロイ手順。
GitHub Actions 経由でデプロイする。

**対象パッケージ:** `packages/mcp-cms-remote`
**依存パッケージ:** `packages/cms-core`
**デプロイ先:** `https://mcp-cms-remote.<subdomain>.workers.dev`（`wrangler.jsonc` の `name` フィールドで決定）
**ワークフロー:** `.github/workflows/deploy-mcp-cms-remote.yml`


## 手順


### Step 1: 事前確認

```bash
git branch --show-current   # develop ブランチであること
git status                  # 未コミット変更がないこと
git pull origin develop     # 最新化
```

未コミット変更がある場合はユーザーに確認する。
develop 以外のブランチの場合は警告する。


### Step 2: 型チェック・lint

```bash
# 2-1: 型チェック
npx tsc --noEmit

# 2-2: lint
npm run lint
```

**失敗時**: 型エラー・lint エラーを修正してから次のステップに進む。


### Step 3: テスト・ビルド検証

```bash
# 3-1: mcp-cms-remote のユニットテスト
cd packages/mcp-cms-remote && npx jest --maxWorkers=1

# 3-2: cms-core のテスト（依存パッケージ）
cd packages/cms-core && npx jest --maxWorkers=1

# 3-3: セキュリティ監査
npm audit

# 3-4: wrangler バンドル検証
cd packages/mcp-cms-remote && npx wrangler deploy --dry-run --outdir=dist
```

全て通過してから次のステップに進む。
`npm audit` で critical/high の脆弱性がある場合は、該当パッケージを更新してから次のステップに進むこと。

**失敗時**: テスト失敗はエラーメッセージから原因を特定して修正。
バンドル失敗は依存パッケージの問題が多い。
`npm ci` を再実行してから再試行。


### Step 4: コミット・push

変更がある場合のみコミットする。

```bash
git add packages/mcp-cms-remote/ packages/cms-core/
git commit -m "feat(mcp-cms-remote): <変更内容>"
git push origin develop
```

**コミットメッセージ規約:**

- `feat(mcp-cms-remote):` — 新機能・機能変更
- `fix(mcp-cms-remote):` — バグ修正
- `refactor(mcp-cms-remote):` — リファクタリング
- `ci(mcp-cms-remote):` — ワークフロー変更

**失敗時**: push が rejected された場合は `git pull --rebase origin develop` で最新を取り込んでから再 push。


### Step 5: CI 検証ゲート

develop push 後、GitHub Actions の CI 完了を待つ。

```bash
# CI の実行状況を確認（GitHub Actions の ci ジョブで判断）
gh run list --branch develop --limit 3
```

- CI が全通過 → Step 6 へ進む
- CI が失敗 → 原因を修正し、Step 2 に戻って全検証を再実行する


### Step 6: PR 作成・マージ

develop → master の PR を作成する。

```bash
gh pr create --base master --head develop \
  --title "feat(mcp-cms-remote): <変更内容>" \
  --body "## Summary
- <変更内容の要約>

## Test plan
- [x] 型チェック・lint 通過
- [x] ユニットテスト通過（mcp-cms-remote）
- [x] ユニットテスト通過（cms-core）
- [x] npm audit で critical/high なし
- [x] wrangler dry-run バンドル成功
- [ ] デプロイ後のヘルスチェック確認"
```

PR の CI が全通過したらマージする。

```bash
# CI 状況を確認
gh pr checks <PR番号>

# マージ
gh pr merge <PR番号> --merge
```

**失敗時**: CI が失敗した場合は原因を修正し、Step 2 に戻る。
マージコンフリクトが発生した場合は develop 上で `git merge master` して解決 → 再 push。


### Step 7: デプロイ確認

master マージ後、`deploy-mcp-cms-remote` ワークフローが自動で発火する。
ワークフローには `concurrency` 設定（`cancel-in-progress: true`）が有効で、同時デプロイは自動的にキャンセルされる。

```bash
# デプロイワークフローの状況を確認
gh run list --workflow=deploy-mcp-cms-remote.yml --limit 3
```

ワークフローの処理内容:

1. `test` ジョブ: cms-core テスト + mcp-cms-remote テスト + バンドル検証
2. `deploy` ジョブ: Workers Secrets 設定 + `wrangler deploy`

**失敗時**: `gh run view --log-failed` でエラーログを確認。
よくある原因:

- `CLOUDFLARE_API_TOKEN` の期限切れ → GitHub Secrets を更新して再実行（Settings → Secrets and variables → Actions で該当 Secret を Update）
- `wrangler deploy` 失敗 → バンドルエラーの詳細を確認
- Secrets 設定失敗 → GitHub Secrets の値を確認

手動再実行:

```bash
gh workflow run deploy-mcp-cms-remote.yml --ref master
```


### Step 8: 動作確認

デプロイ完了後、エンドポイントの動作を確認する。
API キーはコマンド履歴への露出を防ぐため、環境変数経由で渡す。

```bash
# API キーを環境変数に設定（コマンド履歴に残さない）
read -s MCP_API_KEY

# 8-1: ヘルスチェック
curl -s https://mcp-cms-remote.kiyotaka-ueda.workers.dev/health
# Expected: {"status":"ok"}

# 8-2: 認証テスト（キーなし → 401）
curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://mcp-cms-remote.kiyotaka-ueda.workers.dev/mcp \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401

# 8-3: MCP initialize（Bearer トークン認証）
curl -s -X POST https://mcp-cms-remote.kiyotaka-ueda.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
# Expected: serverInfo を含む JSON-RPC レスポンス

# 8-4: tools/list
curl -s -X POST https://mcp-cms-remote.kiyotaka-ueda.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
# Expected: 9 ツール = CMS 6（upload_report, list_reports, get_report, upload_doc, list_docs, delete_doc）
#           + paper 3（get_unwritten_papers, mark_paper_written, list_paper_rankings）
# ツール追加・削除時は packages/mcp-cms-remote/src/server.ts の registerTool 一覧と本行を同期する

# 8-5: S3 接続テスト（list_reports）
curl -s -X POST https://mcp-cms-remote.kiyotaka-ueda.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_reports","arguments":{}}}'
# Expected: S3 レポート一覧の JSON
```

> `MCP_API_KEY` は GitHub Secrets の `MCP_CMS_REMOTE_API_KEY` と同じ値。
> クエリパラメータ認証の場合は URL に `?token=$MCP_API_KEY` を付与する。


### ループバックルール

Step 2 通過後、Step 6（PR マージ）までの間にコード修正が発生した場合は、修正規模に関わらず必ず Step 2 に戻って全検証を再実行する。


## デプロイ失敗時のロールバック

デプロイ後の動作確認（Step 8）で問題が発覚した場合、以下の手順でロールバックする。


### A. wrangler rollback（推奨）

```bash
cd packages/mcp-cms-remote
CLOUDFLARE_API_TOKEN=<token> npx wrangler rollback
```

直前のデプロイバージョンに戻る。
ロールバック後、ヘルスチェック（Step 8-1）で復旧を確認する。


### B. Workers ダッシュボードからの手動ロールバック

1. https://dash.cloudflare.com → Workers & Pages → `mcp-cms-remote`
2. Deployments タブ → 正常なバージョンを選択 → Rollback


### C. 修正して再デプロイ

1. develop で原因を修正
2. Step 2 に戻って全検証を再実行
3. PR 作成 → master マージ → 自動デプロイ


## 完了確認

```
[ ] develop ブランチが最新
[ ] 型チェック通過（tsc --noEmit）
[ ] lint 通過
[ ] ユニットテスト通過（mcp-cms-remote）
[ ] ユニットテスト通過（cms-core）
[ ] npm audit で critical/high なし
[ ] wrangler dry-run バンドル成功
[ ] コミット・push 済み
[ ] CI 検証ゲート通過
[ ] develop → master PR マージ済み
[ ] deploy-mcp-cms-remote ワークフロー成功
[ ] ヘルスチェック OK
[ ] 認証テスト OK（401）
[ ] MCP initialize OK
[ ] tools/list OK（5ツール）
[ ] S3 接続テスト OK（list_reports）
```


## GitHub Actions ワークフロー

ワークフロー: `.github/workflows/deploy-mcp-cms-remote.yml`

- **トリガー**: master push（パス限定: `packages/mcp-cms-remote/**`, `packages/cms-core/**`, `.github/workflows/deploy-mcp-cms-remote.yml`）、PR、`workflow_dispatch`
- **同時実行制御**: `concurrency` で同一 ref の重複実行を自動キャンセル
- **test ジョブ**: cms-core テスト + mcp-cms-remote テスト + バンドル検証（dry-run）
- **deploy ジョブ**: master push 時のみ実行。Workers Secrets 設定 + `wrangler deploy`

**必要な GitHub Secrets:**

| Secret | 用途 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | wrangler 認証 |
| `MCP_CMS_REMOTE_API_KEY` | MCP エンドポイントの Bearer トークン |
| `ANYTIME_AWS_ACCESS_KEY_ID` | S3 アクセス |
| `ANYTIME_AWS_SECRET_ACCESS_KEY` | S3 アクセス |
| `S3_DOCS_BUCKET` | S3 バケット名 |

**Secrets の更新手順:**

1. GitHub リポジトリ → Settings → Secrets and variables → Actions
2. 該当の Secret の **Update** をクリック
3. 新しい値を入力して Save
4. `gh workflow run deploy-mcp-cms-remote.yml --ref master` で再デプロイ
