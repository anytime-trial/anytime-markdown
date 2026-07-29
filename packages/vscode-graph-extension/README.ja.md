# Anytime Graph

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-graph-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-graph-extension/README.md)

**テキストの中の「何と何が一緒に語られたか」を、VS Code の中で図にする。**

インタビュー記録・レビューコメント・アンケートの自由記述を読んでも、語同士のつながりは一覧では見えてきません。かといって図にするために外部の分析ツールへ持ち出すと、元テキストとの往復で手間がかかります。

Anytime Graph なら、共起ネットワーク（`*.cooc.json`）を VS Code のカスタムエディタで直接編集でき、**AI に生成させてから人が手で整える**流れがそのまま回せます。

[**オンラインエディタで試す**](https://www.anytime-trial.com/cooccurrence)


## 1. できること

- **共起ネットワークをビジュアル編集** — 円の大きさ＝出現頻度、線＝共起の強さ、色＝クラスタ
- **語の追加・編集をパネルから** — 語一覧の検索・追加・名前変更・頻度設定・クラスタ設定・削除
- **見たいところだけ残す絞り込み** — 最小頻度・最小共起強度・上位の共起で表示を間引き
- **フォースレイアウトは Worker で計算** — 大きなネットワークでも UI が固まらず、途中で中断できる
- **座標をファイルにキャッシュ** — 開き直しても同じ配置。内容を変えたときだけ再計算
- **PNG 書き出し** — 図をそのまま資料に貼れる
- **サイドバーに一覧** — ワークスペース内の `*.cooc.json` を一覧して開ける


## 2. はじめかた

1. アクティビティバーの **Anytime Graph** を開く
2. 「共起ネットワーク」ビューのタイトルバーで **+**（`Anytime Graph: 新規作成`）を実行
3. ファイル名を入力する（既定 `untitled.cooc.json`）
4. 空の共起ネットワークが作成され、カスタムエディタで開きます

既存の `*.cooc.json` は、エクスプローラから開けばそのままカスタムエディタで表示されます。\
新規作成の保存先はワークスペースの第 1 フォルダ直下です（パス区切りを含む名前は入力できません）。


## 3. 語と共起の編集

右パネルの「語一覧」から語を編集します。図の中の語をクリックすると一覧側の選択も追随します。

| 操作 | 内容 |
| --- | --- |
| **追加** | 語と頻度を指定して新しい語を追加 |
| **名前変更** | 語のラベルを変更 |
| **頻度を設定** | 円の大きさに反映（面積が頻度に比例） |
| **クラスタを設定** | 円の色に反映。未所属は「クラスタなし」 |
| **削除** | 語と、その語につながる共起をまとめて削除 |

**共起（語と語をつなぐ線）の追加・強度変更にはまだ GUI がありません。** 共起を含む図は「6. AI（MCP）から生成する」の手順で作るか、ファイルを直接編集してください。


## 4. 絞り込みと表示

語が増えると図は読めなくなります。左パネルの「絞り込み」で表示を間引けます。

- **最小頻度** — 指定未満の語を図から隠す
- **最小共起強度** — 弱い共起の線を隠す
- **上位の共起** — 強い順に上位 N 本だけ残す
- 絞り込みは**表示だけ**を変え、ファイルの内容は変更しません
- 隠れた語は一覧側に「現在の絞り込みにより図では非表示」と表示されます

ツールバーからは **全体表示**（図全体を画面に収める）・**PNG**（画像書き出し）・**保存**・**パネルの表示/非表示**を操作できます。\
表示言語とカラーテーマは VS Code の設定に追従します。


## 5. レイアウト

配置はフォースレイアウト（斥力・引力・原点方向の求心力）で計算します。計算は Web Worker で行うため、実行中もエディタは操作でき、ツールバーの **中断** で止められます。

- 計算結果は `*.cooc.json` の `layout` に座標としてキャッシュされます
- キャッシュは内容のハッシュとアルゴリズム版数で検証され、**語や共起を変えたときだけ**再計算されます
- 共起を 1 つも持たない孤立語も原点方向に引き寄せられ、図の外へ発散しません


## 6. AI（MCP）から生成する

**MCP サーバー（mcp-graph）は拡張に同梱されており、追加のインストールは不要です。** テキストの分析結果からそのまま共起ネットワークを書き出せます。共起の端点は**語のラベル**で指定でき、添字を数える必要はありません。

| ツール | 用途 |
| --- | --- |
| `write_cooccurrence` | `*.cooc.json` を書き出す（`replace` = 全置換 / `append` = 既存の語・共起を残して追記） |
| `read_cooccurrence` | 既存の `*.cooc.json` を語ラベル付きで読み取る |

接続は自動で行われます。

- **VS Code（Copilot / Chat）** — 拡張が MCP サーバーを提供するため設定不要
- **Claude Code** — 拡張の起動時にワークスペースの `.mcp.json` へ `mcp-graph` を追記します。既に同名エントリがある場合は上書きしません（手を入れた構成を壊さないため）。設定を作り直したいときはコマンドパレットの `Anytime Graph: MCP サーバーを .mcp.json に登録` を実行してください

生成したファイルを本拡張で開き、頻度やクラスタを人が手で整える、という分担が想定した使い方です。


## 7. ファイル形式

共起ネットワークは `*.cooc.json` として保存されます。プレーンな JSON でバージョン管理に適しています。

```json
{
  "meta": { "schemaVersion": 1, "generatedAt": "2026-07-22T00:00:00.000Z", "origin": "manual" },
  "spec": {
    "title": "インタビュー分析",
    "subject": 0,
    "nodes": [{ "label": "納期", "frequency": 12 }],
    "links": [[0, 1, 0.8]],
    "clusters": [{ "label": "制約", "members": [0, 1] }]
  }
}
```

- `links` は `[語の添字, 語の添字, 強度]`。`nodes` **の添字が語の識別子**のため、手で編集するときに `nodes` を並べ替えたり途中から削除すると既存の `links` の指す先が変わります
- `subject`（中心事象）に指定した語は枠線を太くして強調します
- `layout` は座標キャッシュなので、手で書く場合は省略できます


## 8. 主なコマンド

| コマンド | 動作 |
| --- | --- |
| `Anytime Graph: 新規作成` | 空の `*.cooc.json` を作成してエディタで開く |
| `Anytime Graph: 一覧を更新` | サイドバーの共起ネットワーク一覧を再読み込み |
| `Anytime Graph: MCP サーバーを .mcp.json に登録` | `.mcp.json` の `mcp-graph` エントリを作成・更新（既存があれば上書き） |


## 9. ライセンス

[MIT](https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE)
