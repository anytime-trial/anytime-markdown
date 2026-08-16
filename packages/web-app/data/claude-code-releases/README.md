# Claude Code リリース年表のデータ

`/timeline` ページが表示する Claude Code / Claude モデルのリリース年表のデータ置き場。

## 正本と派生の関係

知識の正本は `<docsRoot>/report/daily-research/*.md` と `<docsRoot>/report/weekly-research/*.md`（日次・週次の技術調査レポート）である。ここに置くのはそこからの派生物で、次の 2 層に分かれる。

| 層 | パス | 性質 |
| --- | --- | --- |
| 生データ | `raw/*.json` | レポート本文から抽出した結果。人（LLM）が読解した成果物なので手で直してよい |
| 成果物 | `releases.json` | `raw/` を機械的に正規化した生成物。**手で編集しない** |

## 再生成

```bash
npm run data:releases -w @anytime-markdown/web-app
```

`scripts/build-release-timeline.ts` が `raw/*.json` を読み、表記ゆれの吸収（影響度の 高/中/低 → high/medium/low、モデル版の `opus-5` → `Opus 5`）・同一バージョンの統合・日付昇順の並べ替えを行って `releases.json` を書き出す。正規化のロジックは純粋関数として `src/lib/releaseTimeline/normalize.ts` にあり、`src/__tests__/releaseTimelineNormalize.test.ts` が検証している。

スキーマ違反（`date` が `YYYY-MM-DD` でない、`kind` が未知など）はスクリプトが例外で落とす。黙って落とさないのは、1 件の欠落が年表では「そのリリースが無かった」ようにしか見えないため。

## 新しいレポートを取り込む

抽出そのものは散文の読解を伴うため機械化していない。手順:

1. 対象期間の日次レポートから Claude Code 本体（`kind: "cli"`）と Claude モデル（`kind: "model"`）のリリース記述を拾う
2. `raw/releases-<範囲>.json` として次の形で書き出す
3. 再生成コマンドを実行し、`releases.json` の差分を確認する

```json
[
  {
    "version": "2.1.224",
    "kind": "cli",
    "date": "2026-08-07",
    "dateConfidence": "explicit",
    "headline": "self-hosted runner・cross-session messaging 正式化",
    "highlights": ["変更点 1", "変更点 2"],
    "impact": "high",
    "sourceReport": "2026-08-07-daily-research.md",
    "sourceUrl": "https://code.claude.com/docs/en/changelog"
  }
]
```

- `dateConfidence`: レポート本文にリリース日の明記があれば `explicit`、無くレポート発行日で代用したなら `report-date`。画面ではこの区別を「日付は推定」として出す
- `impact`: レポートの「影響度」表記に従う。判断できないときは `null`（自分で格付けしない）
- 同じバージョンが複数レポートに現れてよい。統合は再生成側が行う

## 既知の限界

- 収録範囲は日次レポートの実施期間（2026-03-23 以降）に限られる。それ以前の Claude Code のリリースは載っていない
- レポートが複数版をまとめて記述していた区間は範囲表記（例 `2.1.136-2.1.138`）のまま 1 エントリになっている
- 欠番（レポートに記述が無かった版）は年表にも現れない。年表の「全バージョン」は changelog 全件ではなく**レポートが観測した全件**である
