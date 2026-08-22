# `--devcontainer`: Dev Container ファイル生成

`--devcontainer` 指定時に実行する生成手順。**WSL ホストで Dev Container をこれから作る**ケースを想定し、
`anytime-lab` のクローン結果に依存せず、スキル同梱テンプレ（`scaffold/devcontainer-files/`）から生成する。

フラグ未指定時は生成しない（in-place は既存 `.devcontainer/` を現状温存、`--new-dir` は anytime-lab 由来を使う）。


## 1. 生成対象と上書き規則

| 生成先 | テンプレ | 既存がある場合 |
| --- | --- | --- |
| `.devcontainer/devcontainer.json` | `devcontainer.json.tmpl` | **確認のうえ上書き**（第 3 章） |
| `docker-compose.yml`（プロジェクトルート） | `docker-compose.yml.tmpl` | **生成しない**（既存を優先） |
| `Dockerfile`（プロジェクトルート） | `Dockerfile.tmpl` | **生成しない**（既存を優先） |

`docker-compose.yml` / `Dockerfile` を不在時のみ生成するのは、`anytime-lab` 由来の既存構成
（named volume・ホストマウント・APP_PORT 連動）を壊さないため。両ファイルへの Postgres 追記は
`stacks/t3-default.md` 第 5〜6 章が担当し、本手順と役割が重ならない。

`devcontainer.json` だけ常に生成するのは、テンプレが T3 に必要な設定
（`forwardPorts: [3000, 5432]`・`postCreateCommand` の `npm install && npx prisma migrate dev`・
Prisma / Tailwind 拡張）を内包しており、既存ファイルへの追記より結果が決定的になるため。
このとき `t3-default.md` 第 7 章（devcontainer.json への追記）は**スキップする**（二重適用を避ける）。


## 2. 置換

テンプレ内の `<project-name>` をプロジェクト名へ置換する。

- in-place モード: `basename "$PWD"`
- `--new-dir` モード: `q1_purpose` から導出した kebab-case 名

```bash
sed -e "s|<project-name>|${PROJECT_NAME}|g" \
  "<skillDir>/scaffold/devcontainer-files/devcontainer.json.tmpl" \
  > .devcontainer/devcontainer.json
```

生成物は置換済みのため `scaffold/rename-map.json` の `targets` には**含めない**（二重置換を避ける）。


## 3. 既存ファイルの確認ゲート

`.devcontainer/devcontainer.json` が既に存在する場合、**無警告で上書きしない**。次を提示して
`AskUserQuestion` で続行可否を確認する。

1. 上書き対象のパス
2. 既存ファイルの `name` / `service` / `forwardPorts` / `postCreateCommand`（`jq` で抽出）
3. git 管理下なら未コミット差分の有無（`git status --porcelain -- .devcontainer/devcontainer.json`）

選択肢は `上書きする` / `生成をスキップする` / `中断する` の 3 つ。`生成をスキップする` を選んだ場合は
`t3-default.md` 第 7 章（既存 devcontainer.json への追記）へフォールバックする。


## 4. 生成後の検証

```bash
test -f .devcontainer/devcontainer.json || echo "NG: devcontainer.json が無い"
jq -e '.service' .devcontainer/devcontainer.json > /dev/null || echo "NG: service が無い"

# compose の service 名と devcontainer.json の service が一致するか（不一致だと Reopen in Container が失敗する）
SERVICE=$(jq -r '.service' .devcontainer/devcontainer.json)
grep -q "^  ${SERVICE}:" docker-compose.yml || echo "NG: docker-compose.yml に service ${SERVICE} が無い"
```

生成自体に Docker daemon は要らない（ファイル出力のみ）。実際の build と起動確認は
`verification.md` の `--new-dir` モード手順が担当する。
