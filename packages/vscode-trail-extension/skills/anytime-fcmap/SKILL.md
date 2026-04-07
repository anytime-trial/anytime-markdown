---
name: anytime-fcmap
description: C4モデル解析とソースコード分析から Feature-Component Map（featureMatrix）を生成・更新する。「/anytime-fcmap」で手動実行。c4-model.json の featureMatrix を自動生成する。
user_invocable: true
---

# F-C Map 生成・更新

## 概要

ソースコード解析から featureMatrix（カテゴリ・機能定義・container/component マッピング）を生成し、`c4-model.json` に書き出す。


## モード判定

1. `.vscode/c4-model.json` を読み込む
2. `featureMatrix` が存在しない → **新規生成モード**
3. `featureMatrix.project` または `featureMatrix.tsconfig` が現在の値と不一致 → ユーザーに確認:「プロジェクトまたは tsconfig が異なります。破棄して再作成しますか？」→ Yes: 新規生成モード / No: 終了
4. `featureMatrix.revision` が存在する → **差分更新モード**
5. `revision` が存在しない → **新規生成モード**


## 新規生成モード

### Step 1: C4 モデル解析

`trail-core` CLI でソースコード解析を実行する。

```bash
node packages/trail-core/bin/trail.js \
  --format c4 \
  --tsconfig tsconfig.json \
  --output /tmp/c4-analysis.json
```

出力された `/tmp/c4-analysis.json` を読み、container 一覧・component 一覧を整理する。

### Step 2: 既存データの保持

`.vscode/c4-model.json` が存在する場合:

- `model` と `boundaries` はそのまま保持（C4 解析結果で上書きしない）
- 手動要素（`manual: true`）を保持
- `featureMatrix` のみ置換対象

### Step 3: featureMatrix 生成

C4 モデルの要素構造とソースコードを読み、以下を生成する。

#### 3a. カテゴリ定義

パッケージの責務領域で分類する。
各 container のソースコード構造を確認し、プロジェクトの主要機能領域をカテゴリとして定義する。

- カテゴリ ID: `cat_` プレフィックス + 英語の短縮名
- カテゴリ名: 日本語の短い説明

#### 3b. 機能定義

各 container/component のディレクトリのファイル一覧を Glob で取得し、ファイル名・export シンボルから機能単位を識別する。

- 機能 ID: `f_` プレフィックス + スネークケース英語名
- 機能名: 日本語の短い説明
- categoryId: 所属カテゴリの ID

#### 3c. マッピング生成

各機能がどの container/component で実装されているかを判定する。

**role 判定基準:**

| role | 基準 |
| --- | --- |
| primary | 機能の主要な実装を持つ（コア処理、アルゴリズム、UI コンポーネント） |
| secondary | 機能を補助的にサポートする（設定、ユーティリティ、型定義） |
| dependency | 機能を利用する側（ホスト、統合レイヤー、ラッパー） |

**マッピング除外対象（以下のコンポーネントはスキップ）:**

- name が `packages`（re-export バレルファイル）
- name が `testUtils`
- name が `__mocks__`
- name が `exports`（re-export 用）

### Step 4: c4-model.json への書き出し

featureMatrix にメタデータを付与して書き出す:

- `project`: `package.json` の `name`
- `tsconfig`: 使用した tsconfig の相対パス
- `revision`: `git rev-parse HEAD` の出力

`.vscode/c4-model.json` に `{ model, boundaries, featureMatrix }` を JSON 形式で書き出す。


## 差分更新モード

### Step 1: 変更ファイルの特定

```bash
git diff <featureMatrix.revision>..HEAD --name-only -- 'packages/*/src/**'
```

### Step 2: 影響範囲の特定

変更ファイルのパスから影響を受ける container/component を特定する。

パスの変換ルール:

```
packages/{pkg-name}/src/{dir}/...
→ container: pkg_{pkg-name}
→ component: pkg_{pkg-name}/{dir}
```

### Step 3: 影響範囲のみ再解析

影響を受ける component のソースコードのみを Glob/Read で読み直す。

- 既存マッピングの更新（role 変更、機能追加）
- 新規ファイルに対応する機能定義・マッピングの追加
- 削除されたファイルに対応するマッピングの除去

影響範囲外のカテゴリ・機能・マッピングはそのまま保持する。

### Step 4: c4-model.json の更新

- `featureMatrix.revision` を現在の HEAD に更新
- その他メタデータ（`project`、`tsconfig`）が最新であることを確認
- `.vscode/c4-model.json` に書き出す
