# SQLite テーブル定義ガイドライン

更新日: 2026-05-07

SQLite (better-sqlite3 / sql.js / libsql) で永続化するテーブルを定義・変更する際のルール。\
2026-05-07 の trail.db スキーマ整備 (STRICT + CHECK + 拡張 FK + ON DELETE 規約化) の知見を体系化したもの。

## 適用範囲

| 対象 | 例 |
| --- | --- |
| 新規テーブル定義 | `packages/trail-core/src/domain/schema/tables.ts` への CREATE TABLE 追加 |
| 既存テーブルへの列追加 | `ALTER TABLE ADD COLUMN` |
| 既存テーブルへの制約追加 | CHECK / FK / UNIQUE 追加 (テーブル再作成が必要) |
| インデックス追加・改名 | `CREATE INDEX IF NOT EXISTS` |
| マイグレーションスクリプト作成 | `scripts/migrate-*.mts` |

> [!IMPORTANT]
> このガイドラインは SQLite (3.37+) を前提とする。Postgres / MySQL は別ルールに従う。

---

## 1. 設計原則 (5 原則)

すべてのテーブル定義はこの 5 原則を満たす。違反する場合はコメントで理由を明記する。

| # | 原則 | 違反例 |
| --- | --- | --- |
| 1 | **STRICT TABLE** で型を強制 | `CREATE TABLE x (id INTEGER) ` (STRICT なし → INTEGER 列に "abc" が入る) |
| 2 | **CHECK** で値域を明示 (boolean / 列挙 / フォーマット) | `is_error INTEGER` (0/1 以外も入る) |
| 3 | **FK** を必ず定義し、**ON DELETE** を明示 | `parent_id TEXT` (整合性が DB で保証されない) |
| 4 | **timestamp は ISO 8601 + Z** (`YYYY-MM-DDTHH:mm:ss.sssZ`) で統一 | `created_at TEXT DEFAULT (datetime('now'))` (`2026-05-07 12:00:00` 形式になる) |
| 5 | **DEFAULT は意味を持つ値** に限定 (空文字回避) | `committed_at TEXT NOT NULL DEFAULT ''` (空文字とデータ未設定を区別不能) |

---

## 2. STRICT TABLE 必須

### 2.1 ルール

すべての CREATE TABLE 末尾に `STRICT` を付ける。

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0
) STRICT
```

### 2.2 STRICT で許される型

`INT` / `INTEGER` / `REAL` / `TEXT` / `BLOB` / `ANY` の 6 種のみ。`VARCHAR(255)` / `TIMESTAMP` / `BOOLEAN` は SQL エラー。

### 2.3 既存非 STRICT → STRICT への移行

既存データに型不一致が混在することがある。例: `lines_pct REAL` 列に `"85.3"` という文字列。\
INSERT 時に `cannot store TEXT value in REAL column` で拒否される。

**対処**: マイグレーション時に CAST する。

```javascript
// 新テーブルの宣言型に合わせて CAST
const t = typeByCol.get(col); // "REAL" / "INTEGER" / "TEXT"
const expr =
  t === 'INT' || t === 'INTEGER' || t === 'REAL'
    ? `CAST("${col}" AS ${t}) AS "${col}"`
    : `"${col}"`;
db.exec(`INSERT INTO new_t (...) SELECT ${expr},... FROM old_t`);
```

---

## 3. 型と CHECK 制約

### 3.1 boolean は INTEGER + CHECK

SQLite に boolean 型はない。INTEGER で 0/1 を CHECK で強制する。

```sql
is_error INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0, 1))
```

> [!WARNING]
> \\\\\\\\\\\\\\\`is_error BOOLEAN\\\\\\\\\\\\\\\` は STRICT で構文エラー。\\\\\\\\\\\\\\\`INTEGER\\\\\\\\\\\\\\\` + CHECK の 2 段階で表現する。

### 3.2 列挙は CHECK IN (...)

文字列で列挙値を表現する場合、必ず CHECK で値域を縛る。

```sql
source TEXT NOT NULL DEFAULT 'claude_code'
  CHECK (source IN ('claude_code', 'codex', 'gemini', 'cursor', 'other'))
```

### 3.3 JSON 列は CHECK (json_valid(...))

JSON を TEXT に格納する場合、構造妥当性を SQL 層で担保する。

```sql
graph_json TEXT NOT NULL CHECK (json_valid(graph_json))
```

> [!NOTE]
> \\\\\\\\\\\\\\\`json_valid()\\\\\\\\\\\\\\\` は SQLite 3.38 で組み込み済 (json1 拡張がデフォルト有効)。

### 3.4 timestamp は GLOB CHECK で書式固定

ISO 8601 + Z 形式 (UTC) のみ受け入れる。ms 付き 24 文字 + ms なし 20 文字の両方を許容。

```sql
-- TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z'
-- TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'
analyzed_at TEXT NOT NULL CHECK (analyzed_at GLOB ${TS_GLOB_MS} OR analyzed_at GLOB ${TS_GLOB_NO_MS})
```

NULL 許容にする場合:

```sql
updated_at TEXT CHECK (updated_at IS NULL OR updated_at GLOB ${TS_GLOB_MS} OR updated_at GLOB ${TS_GLOB_NO_MS})
```

date-only (`YYYY-MM-DD`) 列の場合:

```sql
date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
```

> [!IMPORTANT]
> GLOB は \\\\\\\\\\\\\\\`?\\\\\\\\\\\\\\\` / \\\\\\\\\\\\\\\`*\\\\\\\\\\\\\\\` / \\\\\\\\\\\\\\\`[abc]\\\\\\\\\\\\\\\` / \\\\\\\\\\\\\\\`[a-z]\\\\\\\\\\\\\\\` のみサポートする。\\\\\\\\\\\\\\\`(...)?\\\\\\\\\\\\\\\` のような正規表現の任意グループは使えないため、ms 付き / なしを表現するには OR で繋ぐ。

### 3.5 NULL vs 空文字

| 状況 | 推奨 |
| --- | --- |
| timestamp / hash / id / 数値風 TEXT | NULL-able。空文字は禁止 |
| 説明文 / ラベル / 任意のテキスト | NOT NULL DEFAULT `''` 可 |

> [!WARNING]
> timestamp 列に \\\\\\\\\\\\\\\`NOT NULL DEFAULT ''\\\\\\\\\\\\\\\` を付けると、空文字とデータ未設定が判別不能になる。NULL-able TEXT にする。

---

## 4. 主キー (PRIMARY KEY)

### 4.1 単一 PK

```sql
id TEXT PRIMARY KEY
```

### 4.2 複合 PK

複合 PK は末尾に `PRIMARY KEY (...)` で宣言する。

```sql
CREATE TABLE session_costs (
  session_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, model)
) STRICT
```

### 4.3 INTEGER PRIMARY KEY と AUTOINCREMENT

`INTEGER PRIMARY KEY` は ROWID と同義。`AUTOINCREMENT` は不要かつ書き込み性能を低下させる。

| 構文 | 動作 | 推奨 |
| --- | --- | --- |
| `id INTEGER PRIMARY KEY` | ROWID 自動採番。削除済 ID は再利用される | ○ (ほぼ全ケース) |
| `id INTEGER PRIMARY KEY AUTOINCREMENT` | ROWID + sqlite_sequence テーブルで重複を完全に排除。書き込み毎に追加 I/O | × (UNIQUE 制約や別カラムで代替する) |

---

## 5. 外部キー (FOREIGN KEY)

### 5.1 必須事項

すべての参照関係に FK を宣言し、`ON DELETE` 動作を明示する。

```sql
session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
```

### 5.2 ON DELETE 動作の選択

| 動作 | 用途 | 例 |
| --- | --- | --- |
| `CASCADE` | 子レコードは親に従属 (ライフサイクル一致) | `messages.session_id → sessions.id` |
| `SET NULL` | 親消滅後も子は単独で意味を持つ | `messages.parent_uuid → messages.uuid` |
| `NO ACTION` (default) | 親に子があると DELETE をエラー | 参照整合を強制したい時 |
| `RESTRICT` | NO ACTION より厳密 (transaction 内で即時拒否) | あまり使わない |

> [!IMPORTANT]
> \\\\\\\\\\\\\\\`ON DELETE\\\\\\\\\\\\\\\` を省略すると \\\\\\\\\\\\\\\`NO ACTION\\\\\\\\\\\\\\\` (削除エラー) になる。意図して NO ACTION にする場合も明示する。

### 5.3 自己参照 FK

階層構造 / リンクリストには自己参照 FK + `ON DELETE SET NULL` を使う。

```sql
parent_uuid TEXT REFERENCES messages(uuid) ON DELETE SET NULL
```

### 5.4 複合 FK

複合 PK を参照する場合は `FOREIGN KEY (...) REFERENCES table(...)` 形式を使う。

```sql
CREATE TABLE c4_manual_relationships (
  repo_name TEXT NOT NULL,
  rel_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  PRIMARY KEY (repo_name, rel_id),
  FOREIGN KEY (repo_name, from_id) REFERENCES c4_manual_elements(repo_name, element_id),
  FOREIGN KEY (repo_name, to_id)   REFERENCES c4_manual_elements(repo_name, element_id)
) STRICT
```

> [!NOTE]
> 複合 FK は \\\\\\\\\\\\\\\`PRAGMA foreign_key_list\\\\\\\\\\\\\\\` で複数行 (seq=0,1,...) として返る。アプリ側で「1 つの FK = 1 本の代表線」として扱いたい場合、id ごとに集約する必要がある。

### 5.5 PRAGMA foreign_keys

SQLite は **接続単位で** FK 強制を ON/OFF できる。デフォルト OFF なので、アプリ起動時に必ず ON にする。

```javascript
db.pragma('foreign_keys = ON');
```

マイグレーション中は OFF にして、最後に `PRAGMA foreign_key_check` で違反検出する (後述)。

---

## 6. timestamp 列の規則

### 6.1 形式

| 形式 | 用途 | 例 |
| --- | --- | --- |
| ISO 8601 + Z (24 chars, ms 付き) | 標準 | `2026-05-07T12:34:56.789Z` |
| ISO 8601 + Z (20 chars, ms なし) | 互換性 (テスト・外部 API 経由) | `2026-05-07T12:34:56Z` |
| date-only (10 chars) | 日付集計テーブル | `2026-05-07` |

その他の形式 (`2026-05-07 12:34:56` SQLite 既定 / `+09:00` オフセット / Unix epoch) は禁止。

### 6.2 書き込み時の SQL

`datetime('now')` は SQLite 既定形式 (`YYYY-MM-DD HH:mm:ss`) を返すため使用禁止。代わりに `strftime` を使う:

```sql
-- NG
INSERT INTO t (created_at) VALUES (datetime('now'))
-- → '2026-05-07 12:34:56' (空白区切り、ms なし、Z なし)

-- OK
INSERT INTO t (created_at) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
-- → '2026-05-07T12:34:56.789Z'
```

JS 側からは `new Date().toISOString()` で渡す。

### 6.3 NULL-able か NOT NULL か

| 列の意味 | 推奨 |
| --- | --- |
| 必ず存在する (作成時刻 / 開始時刻) | NOT NULL |
| あとから設定される (解決済み時刻 / 完了時刻) | NULL-able |

`NOT NULL DEFAULT ''` は禁止 (#5 違反)。

---

## 7. DEFAULT の指定方針

### 7.1 数値列

```sql
input_tokens INTEGER NOT NULL DEFAULT 0
```

数値の DEFAULT 0 は OK。集計時に `COALESCE` 不要になる。

### 7.2 boolean 列

```sql
is_error INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0, 1))
```

DEFAULT 0 (false) または 1 (true) のいずれか。

### 7.3 列挙列

```sql
source TEXT NOT NULL DEFAULT 'claude_code' CHECK (source IN (...))
```

DEFAULT は CHECK の値域内の値を選ぶ。

### 7.4 テキスト列

| 状況 | 推奨 |
| --- | --- |
| 空文字が「未設定」を意味する (slug / repo_name / commit_message) | `NOT NULL DEFAULT ''` 可 |
| 空文字が無意味 (timestamp / hash / id) | `NULL-able`、DEFAULT 不要 |

### 7.5 JSON 列

```sql
package_tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(package_tags))
```

空配列 `'[]'` または空オブジェクト `'{}'` を DEFAULT に設定。

---

## 8. インデックス命名規則

### 8.1 命名パターン

`idx_<table>_<columns>` で統一する。

| パターン | 例 |
| --- | --- |
| 単一列 | `idx_messages_session_id` |
| 複合列 | `idx_message_tool_calls_session_turn` (session_id, turn_index, call_index) |
| 部分一致用 | `idx_message_tool_calls_timestamp` |

> [!WARNING]
> 短縮テーブル名 (\\\\\\\\\\\\\\\`idx_mtc_session\\\\\\\\\\\\\\\`) は禁止。テーブル名がフルで読める命名にする。drift / 重複の発見が遅れる。

### 8.2 UNIQUE インデックス

CREATE TABLE の `UNIQUE (...)` 制約と SQLite 自動生成 `sqlite_autoindex_*` で十分な場合は手動 UNIQUE インデックスを作らない。

```sql
-- NG: 重複定義
CREATE TABLE message_tool_calls (
  ...
  UNIQUE (message_uuid, call_index)
) STRICT;
CREATE UNIQUE INDEX idx_mtc_unique ON message_tool_calls(message_uuid, call_index);

-- OK: UNIQUE 制約のみ (sqlite_autoindex_message_tool_calls_1 が自動生成される)
CREATE TABLE message_tool_calls (
  ...
  UNIQUE (message_uuid, call_index)
) STRICT;
```

### 8.3 インデックス追加・削除のフロー

| 操作 | コマンド |
| --- | --- |
| 既存 DB に追加 | `CREATE INDEX IF NOT EXISTS idx_X ON ...` (init 時に毎回実行で冪等) |
| 改名 | `DROP INDEX IF EXISTS old; CREATE INDEX IF NOT EXISTS new ON ...` |
| 削除 | `DROP INDEX IF EXISTS X` |

### 8.4 設計判断

新規 SQL クエリ追加時は **`EXPLAIN QUERY PLAN`** で `SEARCH USING INDEX ...` を確認する。\
`SCAN TABLE` が出る場合はインデックス不足。

---

## 9. テーブル再作成 (12-step migration)

SQLite は `ALTER TABLE` で **CHECK 追加・FK 追加・列削除** ができない。これらの変更には公式の 12-step テーブル再作成パターンを使う。

### 9.1 12-step の概要

1. `PRAGMA foreign_keys = OFF`
2. `BEGIN TRANSACTION`
3. 関連 view / trigger / index を退避し DROP
4. `CREATE TABLE X__new (...)` (新スキーマ)
5. `INSERT INTO X__new (cols) SELECT cols FROM X` (CAST 必要なら付ける)
6. `DROP TABLE X`
7. `ALTER TABLE X__new RENAME TO X`
8. 退避した index / trigger / view を再作成
9. `PRAGMA foreign_key_check` で違反検出
10. `COMMIT`
11. `PRAGMA foreign_keys = ON`
12. (任意) `VACUUM` で断片化解消

### 9.2 view の事前退避

`CREATE VIEW v AS SELECT ... FROM t` のように **クロステーブル view** がある場合、`DROP TABLE t` の時点で view が壊れる。view が `tbl_name = t` でないため `getRelatedObjects(t)` では検出されない。

**対処**: トランザクション開始前に **全 view / trigger を退避し DROP** し、最後にまとめて再作成する。

```javascript
const viewDefs = db.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL"
).all();
for (const v of viewDefs) db.exec(`DROP VIEW IF EXISTS "${v.name}"`);
// ... migration ...
for (const v of viewDefs) db.exec(v.sql); // 再作成
```

### 9.3 STRICT への型強化

既存非 STRICT データに型不一致がある場合、INSERT 時に `cannot store TEXT value in REAL column` エラー。\
新テーブルの宣言型に合わせて `CAST(col AS REAL)` で吸収する (上述 2.3)。

### 9.4 orphan cleanup

`PRAGMA foreign_key_check` で違反検出後、`PRAGMA foreign_key_list` で各 FK の `on_delete` を取得し、自動 cleanup する。

```javascript
const violations = db.pragma('foreign_key_check');
// 各違反を (table, fkid) でグループ化
for (const g of grouped.values()) {
  const fk = db.pragma(`foreign_key_list("${g.table}")`).find((f) => f.id === g.fkid);
  if (fk.on_delete === 'SET NULL') {
    db.prepare(`UPDATE "${g.table}" SET "${fk.from}" = NULL WHERE rowid IN (...)`).run();
  } else {
    db.prepare(`DELETE FROM "${g.table}" WHERE rowid IN (...)`).run();
  }
}
```

### 9.5 マイグレーションスクリプトのファイル形式

| 形式 | 推奨 |
| --- | --- |
| `.mts` (TypeScript) | ○ tables.ts から DDL を直接 import できる |
| `.mjs` (JavaScript) | △ DDL を inline 複製する必要があり drift する |

実行コマンド: `node --experimental-strip-types scripts/migrate-X.mts <db-path>`

### 9.6 本番適用の手順

1. 本番 DB を **コピー** して migration を試す (`cp prod.db prod.db.new`)
2. コピーで動作確認 (integrity_check / foreign_key_check / row counts)
3. **VACUUM** で断片化解消
4. **原子的 swap**: `mv prod.db prod.db.before-X-YYYYMMDD; mv prod.db.new prod.db`
5. アプリのリロードを促す (古いファイルディスクリプタ対策)

> [!CAUTION]
> 本番 DB に直接 migration を実行しない。必ずコピーで試して動作確認してから swap する。

---

## 10. アンチパターン

### 10.1 STRICT を付けない

```sql
-- NG
CREATE TABLE x (id INTEGER, name TEXT)
-- → "abc" が id 列に入るバグを許容
```

### 10.2 boolean を BOOLEAN 型で書く

```sql
-- NG (STRICT で構文エラー)
is_error BOOLEAN NOT NULL DEFAULT 0
-- OK
is_error INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0, 1))
```

### 10.3 timestamp に DEFAULT (datetime('now')) を使う

```sql
-- NG (SQLite 既定形式 'YYYY-MM-DD HH:mm:ss' で書き込まれる)
created_at TEXT NOT NULL DEFAULT (datetime('now'))
-- OK
created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   CHECK (created_at GLOB ${TS_GLOB_MS} OR created_at GLOB ${TS_GLOB_NO_MS})
```

### 10.4 timestamp に NOT NULL DEFAULT '' を使う

```sql
-- NG (空文字とデータ未設定が判別不能)
committed_at TEXT NOT NULL DEFAULT ''
-- OK
committed_at TEXT CHECK (committed_at IS NULL OR committed_at GLOB ${TS_GLOB_MS} OR committed_at GLOB ${TS_GLOB_NO_MS})
```

### 10.5 FK の ON DELETE を省略

```sql
-- NG (NO ACTION デフォルト = 親 DELETE 時にエラー、意図不明)
session_id TEXT NOT NULL REFERENCES sessions(id)
-- OK
session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
```

### 10.6 INTEGER PRIMARY KEY AUTOINCREMENT

```sql
-- NG (sqlite_sequence の追加 I/O)
id INTEGER PRIMARY KEY AUTOINCREMENT
-- OK
id INTEGER PRIMARY KEY
```

### 10.7 短縮テーブル名のインデックス命名

```sql
-- NG (どのテーブルか判読困難)
CREATE INDEX idx_mtc_session ON message_tool_calls(session_id);
-- OK
CREATE INDEX idx_message_tool_calls_session_id ON message_tool_calls(session_id);
```

### 10.8 UNIQUE 制約とインデックスの重複定義

```sql
-- NG (sqlite_autoindex_* と重複)
CREATE TABLE x (
  ...
  UNIQUE (a, b)
) STRICT;
CREATE UNIQUE INDEX idx_x_unique ON x(a, b);
-- OK (UNIQUE 制約のみ)
CREATE TABLE x (
  ...
  UNIQUE (a, b)
) STRICT;
```

### 10.9 PRAGMA foreign_keys = ON を忘れる

```javascript
// NG (FK 強制が効かないまま動く)
const db = new Database(path);
// OK
const db = new Database(path);
db.pragma('foreign_keys = ON');
```

### 10.10 マイグレーションを本番 DB に直接適用

`cp prod.db prod.db.new` してから migration → 動作確認 → swap の手順を必ず踏む。\
失敗時のロールバックパスが確保される。

---

## 11. チェックリスト

新規テーブル定義時:

- [ ] `STRICT` を付けたか
- [ ] boolean 列に `INTEGER + CHECK (col IN (0,1))` か
- [ ] 列挙列に `CHECK (col IN ('a','b','c'))` か
- [ ] timestamp 列に GLOB CHECK が付いているか
- [ ] timestamp 列が空文字でなく NULL-able か
- [ ] JSON 列に `CHECK (json_valid(col))` が付いているか
- [ ] FK のすべてに `ON DELETE` が明示されているか
- [ ] 自己参照 FK は `ON DELETE SET NULL` が妥当か検討したか
- [ ] 複合 PK には複合 FK を使ったか
- [ ] `INTEGER PRIMARY KEY AUTOINCREMENT` を使っていないか
- [ ] インデックス名が `idx_<table>_<columns>` 形式か
- [ ] UNIQUE 制約と UNIQUE インデックスを重複定義していないか
- [ ] アプリ起動時に `PRAGMA foreign_keys = ON` を実行しているか

スキーマ変更時:

- [ ] 12-step テーブル再作成スクリプトを書いたか
- [ ] view / trigger を migration 前に退避したか
- [ ] STRICT 化で型不一致が出る列に CAST を入れたか
- [ ] `PRAGMA foreign_key_check` で違反検出 + cleanup を入れたか
- [ ] 本番 DB のコピーで動作確認したか
- [ ] バックアップを `*.before-X-YYYYMMDD` 形式で残したか
- [ ] VACUUM したか

---

## 12. 参考資料

- [SQLite STRICT Tables](https://www.sqlite.org/stricttables.html)
- [SQLite ALTER TABLE — Making Other Kinds Of Changes](https://www.sqlite.org/lang_altertable.html#otheralter) (12-step pattern 公式)
- [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)
- [SQLite GLOB / LIKE](https://www.sqlite.org/lang_expr.html#like)
- [SQLite strftime](https://www.sqlite.org/lang_datefunc.html)
