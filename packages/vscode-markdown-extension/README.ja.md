# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)

![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)

![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)

![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)

![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)**AI が書いた Markdown を、コーディングしながらリッチにプレビュー — VS Code だけで完結。**

AI アシスタントは仕様書や設計書を Markdown で書いてくれますが、プレーンテキストでのレビューは読みにくく、外部ツールとの行き来で集中が途切れがちです。

Anytime Markdown なら、WYSIWYG エディタで Markdown をリッチに表示・編集でき、**AI との共同編集機能**でファイルの競合も防げます。


## 1. できること

- **WYSIWYG 編集** — テーブル・ダイアグラム（Mermaid / PlantUML）・数式（KaTeX）付きでリッチに編集
- ​**Agent Note** — 画像やスクリーンショットを AI ツールに共有
- **Claude Code 共同編集** — AI がファイル編集中にエディタを自動ロックし、競合を防止
- 3つのモード — WYSIWYG・ソース・レビューをワンクリックで切り替え


## 2. はじめかた

`.md` / `.markdown` ファイルを開くと自動的に Anytime Markdown で表示されます。\
VS Code 標準エディタで開きたい場合は、右クリック → **「Open With...」** → **「Text Editor」** を選択。

VS Code 1.109.0 以上が必要です。


## 3. Agent Note — AI にビジュアル情報を共有

画像・表・手書きメモなどの情報を AI ツールに共有できます。

- 画像はクリップボードから直接貼り付け可能
- Claude Code がインストールされている場合、`/anytime-note` スキルが自動生成され、ノートの内容をコンテキストとして AI に指示できる

**使用例:**

1. サイドバーのノート編集を押すと、ノートが表示される
2. Agent Note にスクリーンショットや表を貼り付ける
3. Claude Code で `/anytime-note バグを修正して` と指示する
4. AI がノートの画像を読み取り、コンテキストに基づいて作業を実行する


## 4. Claude Code 協調編集

Claude Code（CLI）がファイルを編集中のとき、Anytime Markdown エディタを自動的にロックし、編集の競合を防ぎます。\
エディタの内容を最新に更新し、変更箇所をマーキングします。

**特徴:**

- **自動セットアップ** — 拡張機能の初回起動時に Claude Code のフック設定を自動追加（`~/.claude/settings.json`）
- **連続編集対応** — 複数の Edit が連続する場合、最後の Edit から 3 秒後にまとめて解除
- **安全なフォールバック** — Claude Code がクラッシュした場合、30 秒後にタイムアウトで自動解除
- **ゼロ設定** — Claude Code がインストールされていれば、追加の設定は不要


## 5. AI Log / AI Memory — Claude Code セッション情報

サイドバーの **Anytime Markdown** パネルに、Claude Code のセッション情報を表示します。

| パネル | 説明 |
| --- | --- |
| **AI Log** | Claude Code のセッション実行ログを Markdown 形式で表示。セッションをクリックすると Anytime Markdown エディタで閲覧できる |
| **AI Memory** | Claude Code がプロジェクトごとに保存した記憶情報（memory）を一覧表示。クリックで内容を確認・編集できる |

> これらのパネルは `~/.claude/projects/` 配下のデータを参照します。\
> Claude Code がインストールされていない環境では表示されません。


## 6. エディタモード

| モード | 内容 |
| --- | --- |
| **WYSIWYG** | 書式・ダイアグラム・テーブル付きのビジュアル編集 |
| **ソース** | 生の Markdown を直接編集 |
| **レビュー** | 読み取り専用。AI 出力のレビューに最適 |

ツールバーのトグルまたは `Ctrl+Alt+S`（Mac は `Cmd+Alt+S`）で切り替え。


## 7. 設定

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | フォントサイズ（px）。0 = VS Code デフォルト |
| `anytimeMarkdown.editorMaxWidth` | `0` | エディタの最大幅（px）。0 = 制限なし |


## 8. ライセンス

MIT
