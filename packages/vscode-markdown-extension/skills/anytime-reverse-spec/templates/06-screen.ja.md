---
title: "画面仕様"
date: "{{today}}"
updated: "{{today}}"
type: "spec"
lang: "ja"
author: "Claude Code v{{cliVersion}}"
category: "basic-design/screen"
c4Scope:
    - "{{systemId}}"
    - "{{primary UI container 1 以降}}"
excerpt: "{{N}} 画面と主要操作の画面遷移図。"
---


# 画面仕様


## 1. 概要

<!--
ガイダンス: 検出されたルーティング種別（Next.js App Router / Pages Router / React Router / Vue Router / Svelte / VS Code WebView）を 1〜2 文で要約する。
画面 0 件の場合は本章を以下のプレースホルダで縮退生成する:

> [!NOTE]
> 本プロジェクトは画面（UI）層を持たない（バックエンド / ライブラリ / MCP サーバ単独）。
> screenGlobs に該当するファイルが検出されなかった。

縮退時は §2 以降を省略してよい。
-->

`{{repoName}}` の画面は {{router-kind}} で構成される。\
全 {{N}} 画面のうち {{MainN}} 画面が主要画面遷移グラフのノードとして抽出された。


## 2. 画面一覧

<!--
ガイダンス: screenId をスラッグ化（例: /users/[id] → screen.users.detail）。
概要列は AI（haiku）に「画面ファイル本文の冒頭・主要 JSX タグ・コメントから 1 文要約」を生成させる。
画面数 ≤ 50 なら 1 バッチ、超過時は分割。
-->

| ID | 名称 | パス / 識別子 | 概要 |
| --- | --- | --- | --- |
| `screen.{{slug}}` | {{画面名}} | `{{/path or component-id}}` | {{1 文要約}} |


## 3. 主操作の画面遷移図

<!--
ガイダンス: stateDiagram-v2 で主要画面間の遷移を 1 図にまとめる。
- ノード = 画面（§2 の ID）
- エッジラベル = trigger（操作名・ボタン名）
- 「主操作」の選定: trigger が空でない遷移エントリ
- 同一エッジが複数 trigger を持つ場合は `/` 区切りで併記
- ノード数 20 超: エッジ件数で上位 20 ノードのみ採用 + 省略注記
- 遷移エントリ 0 件: 図を省略し以下の注記のみ:

> [!NOTE]
> 自動検出された主要遷移はありません。
-->

```mermaid
stateDiagram-v2
    [*] --> screen.{{home}}
    screen.{{home}} --> screen.{{X}}: {{trigger}}
    screen.{{X}} --> screen.{{Y}}: {{trigger}}
```


## 4. 画面とパッケージの対応

<!--
ガイダンス: 画面 ID と所属パッケージ・C4 要素の対応を表形式で。
複数アプリ（web-app / mobile-app / VS Code 拡張 webview）で同じ画面 ID を共有する場合は併記する。
-->

| 画面 ID | パッケージ | C4 要素 |
| --- | --- | --- |
| `screen.{{slug}}` | `{{pkg}}` | `{{pkg_xxx/yyy}}` |


## 5. 画面と機能のマッピング

<!--
ガイダンス: 章 3 機能（コミュニティ）と画面の対応を表で。
画面ファイル内で呼ばれる関数 / hook / コンポーネントから章 3 のコミュニティへ逆引きする。
-->

| 画面 ID | 関連機能（コミュニティ） |
| --- | --- |
| `screen.{{slug}}` | [{{機能名}}](03.feature-detail/feature-{{slug}}.ja.md) |


## 6. 既知の制約

<!--
ガイダンス: 検出ロジック上の限界・誤検出リスクを列挙する。
- 動的ルーティング（[slug] 等）の表現
- WebView の screenId 命名規則
- 検出されなかった画面（カスタムルーター利用時）
該当無しならセクション自体を省略。
-->

- {{制約 1}}
