# Anytime Sheet

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-sheet-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-sheet-extension/README.md)

**表を表のまま編集する — VS Code の中で。**

`.csv` をテキストエディタで開くと、表はカンマの壁になります。Anytime Sheet は Custom Editor を登録し、`.sheet` / `.csv` / `.tsv` をグリッドとして開きます。別のアプリケーションへ往復する必要はありません。

[**オンラインエディタで試す**](https://www.anytime-trial.com/sheet)


## 1. できること

- **`.sheet` / `.csv` / `.tsv` をグリッドで編集** — エクスプローラから開いてセルを直接編集
- **複数シートのワークブック** — `.sheet` は複数シートを保持し、シートタブから追加・名前変更・削除ができる
- **元に戻す・やり直す** — `Ctrl+Z` / `Ctrl+Y` で最大 100 手。行・列のサイズ変更も履歴に含まれる
- **フィルハンドル** — ドラッグで連番・末尾数字・等差・循環の系列を埋める
- **コピー＆ペースト** — グリッド内でもシステムのクリップボードとの間でも動く
- **選択範囲からグラフを作る** — 選んだ範囲からグラフを作成し、シートと一緒に保存する


## 2. はじめかた

`.sheet` / `.csv` / `.tsv` ファイルをエクスプローラから開くと、既定でシートエディタが開きます。

新規作成はコマンドパレットから **「Anytime Sheet: 新しいシートを作成」** を実行します。

既存の `.csv` をテキストとして読みたいときは、右クリックから **「別のエディターで開く」** → **「テキストエディター」** を選びます。


## 3. ファイル形式

| 拡張子 | 扱い |
| --- | --- |
| `.sheet` | ワークブック形式。複数シートを保持し、シート構成を保存後も維持する |
| `.csv` / `.tsv` | 単一シートのプレーンテキスト。同じ区切り形式のまま書き戻す |


## 4. 関連する拡張機能

- [Anytime Markdown](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown) — WYSIWYG の Markdown 編集。Markdown の表を同じグリッドで全画面編集できる（[記法の解説](https://www.anytime-trial.com/markdown/table)）
- [Anytime Graph](https://www.anytime-trial.com/cooccurrence) — グラフホワイトボードエディタ
- [Anytime Trail](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) — 構造・品質・行動の可視化


## 5. ライセンス

MIT
