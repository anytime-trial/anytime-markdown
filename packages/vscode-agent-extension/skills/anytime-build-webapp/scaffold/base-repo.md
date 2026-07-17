# ベースリポジトリ仕様

`/anytime-build-webapp` の Phase 4（Scaffold）で使用するベースリポジトリの取得と前処理を定義する。


## 1. クローン元

| 項目 | 値 |
| --- | --- |
| Origin | `git@github.com:anytime-trial/anytime-lab.git` |
| 取得方法 | `git clone --depth 1` |
| 認証 | SSH 鍵（`~/.ssh/id_*` がホストマウント済み前提） |


## 2. 取得手順

モードによって手順が異なる。

### 2.1. in-place モード（デフォルト）

実行ディレクトリはプロジェクトルート（既存の作業ディレクトリ）。

```bash
# 1. プロジェクト名を CWD basename から導出
PROJECT_NAME=$(basename "$PWD")

# 2. temp ディレクトリに clone（履歴不要、depth=1）
TEMP_DIR=$(mktemp -d)
git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git "$TEMP_DIR"

# 3. .git と .devcontainer を削除
#    - .git: 履歴リセット
#    - .devcontainer: 現状温存のため anytime-lab 側を破棄
rm -rf "$TEMP_DIR/.git" "$TEMP_DIR/.devcontainer"

# 4. CWD に展開（既存ファイルは上書きされる、.devcontainer は触られない）
rsync -a "$TEMP_DIR/" "$PWD/"
rm -rf "$TEMP_DIR"

# 5. リネーム置換適用（rename-map.json 参照、.devcontainer は targets から除外）
#    → 詳細は scaffold/rename-map.json と SKILL.md の Phase 4 手順を参照

# 6. 新規 git 初期化（CWD で実行）
git init
```

### 2.2. --new-dir モード

実行ディレクトリは新規プロジェクトの親ディレクトリ。

```bash
# 1. クローン（履歴不要、depth=1）
git clone --depth 1 git@github.com:anytime-trial/anytime-lab.git <project-name>

# 2. .git を削除（履歴リセット）
rm -rf <project-name>/.git

# 3. リネーム置換適用（rename-map.json 参照）
#    → 詳細は scaffold/rename-map.json と SKILL.md の Phase 4 手順を参照

# 4. 新規 git 初期化
cd <project-name>
git init
```


## 3. 取得直後の期待ファイル

クローン直後に以下のファイル / ディレクトリが存在することを `ls` で確認する。\
1 つでも欠ければ Phase 4 を中断し、ユーザに `anytime-lab` 構成変更の有無を確認する。

| パス | 種別 | in-place モードでの確認元 |
| --- | --- | --- |
| `.devcontainer/devcontainer.json` | ファイル | **既存ファイル**（現状温存） |
| `Dockerfile` | ファイル | anytime-lab から展開 |
| `docker-compose.yml` | ファイル | anytime-lab から展開 |
| `package.json` | ファイル | anytime-lab から展開 |
| `README.md` | ファイル | anytime-lab から展開 |


## 4. 取得失敗時の対処

| エラー | 対処 |
| --- | --- |
| `Permission denied (publickey)` | `ssh -T git@github.com` で SSH 鍵を確認、ユーザに案内 |
| `Could not resolve hostname github.com` | ネットワーク到達性を診断、`ping github.com` を案内 |
| `Repository not found` | リポジトリアクセス権をユーザに確認、`gh repo view anytime-trial/anytime-lab` を案内 |


## 5. リトライ責任

本ファイルの手順実行責任は **`SKILL.md` の Phase 4** にある。\
失敗時は Phase 4 内でユーザ確認のうえ再試行する（自動リトライしない）。
