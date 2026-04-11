# Anytime Markdown

![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=sqale_rating)![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=security_rating)**書く、描く、見通す。Markdown から始まるソフトウェア開発ツール。**


## 特徴的な機能


### C4 アーキテクチャ図 & DSM ライブビューア

TypeScript プロジェクトを1コマンドで解析し、C4 アーキテクチャ図と DSM（依存構造マトリクス）を自動生成する。\
ブラウザのライブビューアで構造を確認しながらコーディングできる。

- L1（システムコンテキスト）〜 L4（コード）の4段階でドリルダウン
- DSM クラスタリングで関連モジュールをグルーピング
- 循環依存を赤枠でハイライト
- VS Code での再解析が WebSocket 経由でリアルタイムに反映

> 詳細: [Anytime Trail README](packages/vscode-trail-extension/README.ja.md)


### グラフエディタ

ノード・エッジを自由に配置するダイアグラムエディタ。\
VS Code 拡張機能で `.graph` ファイルとして保存・編集できる。

- 直交・ベジェ・直線のルーティング切替
- フレームノードによるグルーピング
- SVG / draw.io エクスポート
- 物理レイアウト（力学モデル）

> 詳細: [Graph Core](packages/graph-core/)、[VS Code Graph Extension](packages/vscode-graph-extension/)


### リッチマークダウンエディタ

Tiptap / ProseMirror ベースの WYSIWYG マークダウンエディタ。\
Web、VS Code、Android の3つのプラットフォームで同じ編集体験を提供する。

- Mermaid / PlantUML ダイアグラム描画
- diff 比較・マージビュー
- PDF エクスポート
- テンプレート挿入（スラッシュコマンド）
- 検索・置換、アウトライン、脚注、インラインコメント
- セクション自動番号
- 日本語 / 英語 対応

### MCP サーバー

AI エージェントがプロジェクトの資産に直接アクセスするための MCP（Model Context Protocol）サーバー群。

| サーバー | 機能 |
| --- | --- |
| `mcp-markdown` | Markdown の読み書き・セクション操作・差分計算 |
| `mcp-graph` | グラフドキュメントの CRUD・SVG / draw.io エクスポート |
| `mcp-cms` | S3 上のドキュメント・レポートの管理 |
| `mcp-c4` | C4 モデル・DSM の操作 |


## プロジェクト構成

```mermaid
flowchart TD
    subgraph core ["共有ライブラリ"]
        MC["markdown-core<br/>(エディタエンジン)"]
        GC["graph-core<br/>(グラフエンジン)"]
        TC["trail-core<br/>(TypeScript 解析)"]
        C4["c4-kernel<br/>(C4 モデル・DSM)"]
        CC["cms-core<br/>(S3 クライアント)"]
    end

    subgraph app ["アプリケーション"]
        WA["web-app<br/>(Next.js)"]
        MA["mobile-app<br/>(Capacitor Android)"]
    end

    subgraph ext ["VS Code 拡張機能"]
        VME["vscode-markdown-extension"]
        VGE["vscode-graph-extension"]
        VTE["vscode-trail-extension"]
        VEP["vscode-extension-pack"]
    end

    subgraph mcp ["MCP サーバー"]
        MM["mcp-markdown"]
        MG["mcp-graph"]
        MCM["mcp-cms"]
        MC4["mcp-c4"]
    end

    WA --> MC
    WA --> GC
    WA --> C4
    WA --> CC
    VME --> MC
    VGE --> GC
    VTE --> TC
    VTE --> C4
    VTE --> GC
    MA --> WA
    MM --> MC
    MG --> GC
    MCM --> CC
    MC4 --> C4
```


## 前提条件

- WSL2（Windows の場合）
- Docker Desktop（WSL2 バックエンド）
- VS Code + [Dev Containers 拡張機能](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- Android Studio（Android アプリをビルドする場合）


## 開発環境のセットアップ


### Dev Container を使う場合（推奨）

1. WSL2 上でリポジトリをクローンする
2. GitHub Personal Access Token を WSL のシェルに設定する
3. VS Code でリポジトリを開く
4. コマンドパレット → 「Dev Containers: Reopen in Container」を実行

> 初回はコンテナのビルドと `npm install` が自動実行される。\
> ポート `3000` は自動フォワードされる。


#### GitHub Personal Access Token の設定

GitHub MCP サーバーや `gh` CLI で使用する。\
未設定でも開発は可能だが、PR 作成等の GitHub 操作が制限される。

1. https://github.com/settings/tokens にアクセス
2. 「Generate new token (classic)」をクリック
3. スコープ: `repo` にチェックを入れてトークンを生成
4. WSL のシェル設定ファイルに追加:

```bash
echo 'export GH_TOKEN=ghp_xxxxxxxxxxxxxxxx' >> ~/.bashrc
source ~/.bashrc
```

Dev Container 起動時に `GH_TOKEN` が設定されていれば、GitHub MCP サーバーが自動登録される。

```bash
# 開発サーバーを起動
cd packages/web-app
npm run dev
```

ブラウザで http://localhost:3000 にアクセスする。


### Docker を手動で使う場合

```bash
# 1. コンテナをビルド・起動
docker compose up -d

# 2. コンテナ内に入る
docker compose exec anytime-markdown bash

# 3. 依存パッケージをインストール
npm install

# 4. 開発サーバーを起動
cd packages/web-app
npm run dev
```

ブラウザで http://localhost:3000 にアクセスする。


## テスト


### ユニットテスト

追加インストールは不要。

```bash
# リポジトリルートで全パッケージのテストを実行
npx jest --no-coverage
```


### E2E テスト（Playwright）

Playwright ブラウザは Dockerfile のビルド時にインストール済み。\
パッケージ更新等でブラウザバージョンが変わった場合は、手動で再インストールする:

```bash
npx playwright install --with-deps
```

E2E テストの実行:

```bash
cd packages/web-app
npm run e2e
```

> E2E テストは開発サーバーが起動していなくても、テスト内で自動起動される。

### VSIX ファイルの作成

ローカルインストールやテスト配布用に `.vsix` ファイルを作成する手順。

```bash
# 1. リポジトリルートで依存パッケージをインストール
npm install

# 2. vscode-markdown-extension ディレクトリに移動
cd packages/vscode-markdown-extension

# 3. VSIX ファイルを生成
npx vsce package --no-dependencies
```

`anytime-markdown-<version>.vsix` が生成される。


### ローカルへのインストール

```bash
code --install-extension anytime-markdown-<version>.vsix
```

または VS Code のコマンドパレットから「Extensions: Install from VSIX...」を選択してファイルを指定する。

​
