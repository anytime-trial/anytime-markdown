# Anytime Trail

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-trail?label=VS%20Marketplace&logo=visual-studio-code)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=anytime-trial_anytime-markdown)

**VS Code 用 Git リポジトリ管理、C4 アーキテクチャ図、プロジェクト可視化**

Git リポジトリの管理、コミット履歴の可視化、TypeScript コードベースからのインタラクティブな C4 アーキテクチャ図の生成を、サイドバーパネルから操作できます。

## 機能

### C4 アーキテクチャ図

- **インポート** — Mermaid C4 図（`.mmd`、`.mermaid`、`.txt`）をインタラクティブなキャンバスに読み込み
- **解析** — `tsconfig.json` をスキャンして TypeScript プロジェクトから C4 モデルを自動生成
- **レベル切替** — アーキテクチャレベル（L2: コンテナ、L3: コンポーネント、L4: コード）を切り替えて詳細度を制御
- **インタラクティブキャンバス** — パン、ズーム、ノードクリックでソースファイルを開く、接続ノードのハイライト
- **エクスポート** — JSON（C4 モデル + バウンダリ）または Mermaid 形式（モジュール依存関係）で保存
- **Git 連携** — グラフビューでコミットを選択すると、C4 図上で変更ファイルをハイライト

### Git 管理

- **リポジトリ** — フォルダーを開く / リポジトリをクローン。ドラッグ&ドロップ対応のファイルツリー。ブランチ切替、Markdown フィルター
- **変更** — ステージ / 未ステージの変更を表示。ステージ、アンステージ、破棄、コミット、プッシュをインライン操作。バッジに変更数を表示
- **グラフ** — ASCII アートのコミットグラフ。ローカル / リモートの区別、ブランチ・タグの装飾表示
- **タイムライン** — ファイルごとのコミット履歴。任意のコミットと作業コピーを比較

[Anytime Markdown](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown) がインストールされている場合、Markdown の差分はリッチな比較モードで表示されます。未インストール時は VS Code 標準の diff エディタを使用します。

## 使い方

1. 拡張機能をインストール
2. アクティビティバーの **Anytime Trail** アイコンをクリック
3. **リポジトリ**ビューからフォルダーを開くか、リポジトリをクローン
4. コマンドパレットから **Anytime Trail: Analyze C4** を実行して、TypeScript プロジェクトの C4 図を生成

## ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
