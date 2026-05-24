# i18n キー命名規則

更新日: 2026-05-03

anytime-markdown の TypeScript ベース i18n (`packages/<viewer>/src/i18n/{ja,en}.ts` など) でキーを追加・変更する際の命名規則。VS Code 拡張の `package.nls*.json` (NLS) は別フォーマットだが基本原則は同じ。

## 適用範囲

| 対象 | パス |
| --- | --- |
| trail-viewer | `packages/trail-viewer/src/i18n/{types,ja,en}.ts` |
| graph-viewer | `packages/graph-viewer/src/i18n/` |
| spreadsheet-viewer | `packages/spreadsheet-viewer/src/i18n/` |
| markdown-core | `packages/markdown-core/src/i18n/` |
| web-app | `packages/web-app/src/i18n/` |
| VS Code NLS | `packages/<ext>/package.nls{,.ja}.json` (基本原則のみ参考) |

## 1. 階層構造

ドット区切りの階層キーで、深さは **2〜4 段** に収める。

| 階層 | 用途 | 例 |
| --- | --- | --- |
| 2 段 | 単純なラベル・状態メッセージ | `viewer.loading` / `filter.searchPlaceholder` |
| 3 段 | サブ namespace 配下の関連キー、または `<key>.description` パターン | `c4.popup.functions` / `analytics.totalSessions.description` |
| 4 段 | 階層化された widget の細分化 | `c4.hotspot.controls.granularity` / `analytics.combined.tool.description` |

> [!IMPORTANT]
> 5 段以上は禁止。深くなる場合は top namespace を見直す。

## 2. Top namespace の選び方

優先度順:

1. **タブ・ページ単位** (`analytics`、`releases`、`prompts`、`eval`、`metrics`)\
   → エンドユーザーから見える機能エリア
2. **UI セクション** (`c4.overlay`、`c4.popup`、`c4.elementPanel`)\
   → タブ内の特定 widget 群
3. **概念・データ領域** (`message`、`tokenBudget`、`cost`、`chart`、`stats`)\
   → 横断的に使われるドメインオブジェクト
4. **共通 UI 要素** (`viewer.tab`、`filter`)\
   → 複数画面で再利用されるコンポーネント

> [!NOTE]
> コンポーネント名 (`SessionList` → `sessionList`) を top namespace にするのは、再利用が見込めない単一コンポーネント専用の場合のみ。再利用または横断利用が見込まれる場合は概念名に寄せる。

## 3. サフィックス規則

| サフィックス | 用途 | 必須セット |
| --- | --- | --- |
| `.description` | ラベル本文に対するツールチップ・補足説明 | 短い `<key>` と必ずペアで定義 (例: `analytics.totalSessions` + `analytics.totalSessions.description`) |
| `.name` | metric などの正式名称 (description と対) | DORA 指標などの `name` + `description` ペア |
| `.title` | ページ・セクションタイトル | 本文中のメインタイトルが必要なときのみ。タブラベルには使わない (`viewer.tab.*` を使う) |
| `.empty` | 空状態メッセージ | リスト・カード系で空表示が必要な時 |

> [!WARNING]
> `.title` をタブラベル用途で使ってはいけない。タブラベルは `viewer.tab.<id>` 配下に置く (例: `viewer.tab.releases`)。過去 `releases.title` をタブラベルにしていた経緯あり、現在は移行済み (D1)。

## 4. 単数 / 複数

| 用途 | 推奨 | 例 |
| --- | --- | --- |
| 単一エンティティの操作・属性 | 単数 | `message.collapse` / `message.input` |
| コレクションのラベル (タブ・カウント) | 複数 | `viewer.tab.messages` / `sessionList.messages` |
| 機能・エリアの呼称 | 機能側に従う | `analytics.*` (機能名) / `releases.*` (機能名) |

迷ったら **その下にぶら下がる子キーが「個」を扱うか「集合」を扱うか** で判断する。`messages.*` 配下に個別操作 (`messages.copy` 等) を置きたくなったら違和感が出るので単数 `message.*` が正しい。

## 5. 命名スタイル

| 要素 | スタイル | 例 |
| --- | --- | --- |
| セグメント区切り | ドット `.` | `c4.popup.metric.coverage` |
| セグメント内の語結合 | camelCase | `viewer.selectSession` / `analytics.aiCommitPercent` |
| 略語 | 大文字略語は そのまま (一般化された略語のみ。新規導入は避ける) | `c4.popup.metric.dsm` |

> [!NOTE]
> セグメント内に kebab-case (`view-toggle`) や snake_case (`view_toggle`) を混ぜない。`viewer.viewToggle.heatmap` のように camelCase に統一する。

## 6. アンチパターン

避けるべき書き方:

- **タブラベルが namespace 直下に散在** — `releases.title` / `metrics.title` / リテラル `'Graph'` の混在 → `viewer.tab.*` に集約
- **2 段とその下の構造的サブ namespace の混在** — `viewer.tab.analytics` (3 段、タブラベル) と `viewer.loading` (2 段、状態) を同じ `viewer` 直下で混在させるのは現状許容しているが、新規追加では `viewer.state.loading` 等の専用サブを検討する
- **共有概念を tech 名で固定** — `viewer.tab.c4` のように tech 名 (C4) を内部識別子に固定すると意図が伝わりにくい。表示意図に合わせる (`viewer.tab.model`)
- **孤立キー** — types.ts に定義されているが consumer ゼロのキー (例: 過去の `trace.showSystemMessages`) は YAGNI で削除する
- **`title` サフィックスをタブラベル用途で使う** — `releases.title` をタブラベルにしていた past pattern。`viewer.tab.releases` に移行済み

## 7. 新規キー追加チェックリスト

新しいキーを追加するときは以下を確認する:

- [ ] 該当する top namespace は既存にあるか? (新規導入は避ける)
- [ ] 階層は 2〜4 段に収まっているか?
- [ ] セグメントは camelCase で記述されているか?
- [ ] ラベルが 30 文字以上の説明文になりそうなら、短い `<key>` + `<key>.description` の対で分けたか?
- [ ] 単数 / 複数の選択は本ルールに従っているか?
- [ ] ja.ts と en.ts の両方に追加したか? (片方だけはビルドエラー)
- [ ] types.ts のインタフェース定義に追加したか?
- [ ] アンチパターンに該当していないか?

## 8. 既存キーのリネーム判断

以下のいずれかに該当する場合のみリネーム検討:

- アンチパターンに該当している (例: `viewer.tab.c4` のような tech 名固定)
- 命名と実態が乖離している (例: `TraceTimeline` の中身が message → `MessageTimeline` に統一)
- 同じ意味のキーが複数 namespace に分散している (例: `releases.title` がタブラベル用途、`viewer.tab.releases` に統合)

リネーム時は、以下を 1 PR で同時に変更する:

1. `types.ts` のキー定義
2. `ja.ts` / `en.ts` のキー
3. consumer (コード上の `t('<key>')` 呼び出し全箇所)
4. 仕様書の言及箇所 (`/Shared/anytime-markdown-docs/spec/` 配下)

## 9. VS Code NLS との関係

`package.nls.json` / `package.nls.ja.json` も類似の階層構造 (例: `command.openAiNote`、`config.workspace.path`) で運用するが、本ルールの細部 (`.description` パターン等) はそのまま適用しない。NLS は VS Code 側の table-driven な仕組みのため、command id ・ configuration id と整合させることを優先する。
