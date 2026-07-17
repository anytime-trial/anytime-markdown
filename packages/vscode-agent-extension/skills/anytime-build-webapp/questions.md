# 5 問インタビュー定義

`/anytime-build-webapp` の Phase 1（Interview）で順に質問する 5 問の定義。


## 0. 共通ルール

- 質問数は最大 5。打ち切り条件（第 6 章）に該当した時点で停止
- 各質問は ≤ 2 文、選択肢があれば必ず提示
- 多選択を強制しない（`AskUserQuestion` で multiSelect=false を基本とする）
- 回答は `requirements-template.md` のプレースホルダに埋め込む


## 1. Q1: 何を作る?

| 項目 | 値 |
| --- | --- |
| 質問文 | 「何を作りますか? 1 文で教えてください。」 |
| 形式 | 選択肢（3 択 + Other） |
| 選択肢 | (a) 顧客管理ツール　(b) 在庫管理　(c) ブログ |
| デフォルト | （無し・必須） |
| 埋め込み先 | `requirements-template.md` の `{{Q1_PROJECT_PURPOSE}}` |
| 備考 | 上記 3 つを初期選択肢として提示。`AskUserQuestion` が自動で「Other」を追加するので、独自要求はそこから入力できる |


## 2. Q2: 主要エンティティ

| 項目 | 値 |
| --- | --- |
| 質問文 | 「主要エンティティを 3 つ以下で挙げてください（例: `User`, `Customer`, `Order`）。」 |
| 形式 | カンマ区切りフリーテキスト |
| デフォルト | （無し・必須） |
| 埋め込み先 | `requirements-template.md` の `{{Q2_ENTITIES}}` |
| バリデーション | 3 つ以下、PascalCase、`User` 以外 |


## 3. Q3: 認証方式

| 項目 | 値 |
| --- | --- |
| 質問文 | 「認証はどうしますか?」 |
| 形式 | 選択肢（3 択） |
| 選択肢 | (a) 無し　(b) メールパスワード　(c) OAuth: Google |
| デフォルト | (b) メールパスワード |
| 埋め込み先 | `requirements-template.md` の `{{Q3_AUTH}}` |


## 4. Q4: スタック上書き

| 項目 | 値 |
| --- | --- |
| 質問文 | 「スタックの上書き指定はありますか?」 |
| 形式 | 選択肢（4 択） |
| 選択肢 | (a) 無し（T3 デフォルト）　(b) Python BE　(c) Hono BE　(d) その他 |
| デフォルト | (a) 無し |
| 埋め込み先 | `requirements-template.md` の `{{Q4_STACK_OVERRIDE}}` |
| 備考 | (b)〜(d) 選択時は `stacks/overrides.md` の判定に従う |


## 5. Q5: 画面デザイン参照源

| 項目 | 値 |
| --- | --- |
| 質問文 | 「画面デザインの参照源はありますか?」 |
| 形式 | 選択肢（3 択） |
| 選択肢 | (a) 無し（標準 Tailwind）　(b) 参考 URL を指定　(c) DESIGN.md ファイルパスを指定 |
| デフォルト | (a) 無し |
| 埋め込み先 | `requirements-template.md` の `{{Q5_DESIGN_SOURCE}}`・`{{Q5_DESIGN_VALUE}}` |
| 備考 | (b) / (c) を選んだ場合、続けて URL / パスをフリーテキストで入力 |


## 6. 打ち切り条件

以下のいずれかに該当した時点で残り質問をスキップ。

- Q1〜Q3 が明確で Q4・Q5 が CLI 引数で事前指定済み
- 1 問で 3 つ以上の情報が出てきた場合（例: Q1 で「`User` と `Order` の顧客管理ツール、Google 認証で」→ Q1・Q2・Q3 を一括充足）
- 5 問終了時点で曖昧な点が残る場合は「想定 X で進めます。違えば指示してください」と表明して継続


## 7. CLI 引数による事前充足

| CLI 引数 | スキップする質問 |
| --- | --- |
| `<1 行の要求>` | Q1 |
| `--design-url <URL>` | Q5（参考 URL） |
| `--design-file <path>` | Q5（DESIGN.md ファイル） |
| `--no-auth` | Q3（無し） |
| `--auth=email-password` | Q3（メールパスワード） |
| `--auth=google` | Q3（OAuth: Google） |


## 8. 質問順序の優先

Q1 → Q2 → Q3 → Q4 → Q5 の固定順。Q4 が「無し」以外で未対応スタックの場合、Phase 1.5 で確認質問を 1 回追加するが本 5 問の枠外。
