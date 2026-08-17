/**
 * contentless FTS5 索引を作り直す。
 *
 * `caravan_entities_fts` / `caravan_episodes_fts` は `content=''` の contentless FTS5 で、
 * 本体テーブルとのトリガ連動を持たない。`runRagFtsRebuild` は**現存する行を入れ直す**
 * だけなので、行が削除された場合の rowid は索引に残り続け、消したはずのエンティティが
 * 全文検索に出てくる（本番実測: purge 後に entities 44,691 に対し FTS 45,062 行）。
 *
 * かといって rowid 単位の一括 DELETE は `contentless_delete=1` の索引を壊した実績がある
 * （integrity_check でしか検知できない破損）。索引ごと作り直して全件入れ直すのが、
 * 削除を索引へ反映する唯一の安全な手順である。
 *
 * DDL は migration 023 (`023_table_prefix.ts`) と同一。片方だけ変えると
 * tokenize の差で検索結果が静かに変わるため、変更時は両方を同時に直すこと。
 */

import type { CaravanDbConnection } from '../db/connection/types';
import { noopLogger, type CaravanLogger } from '../logger';

const FTS_TOKENIZE = "tokenize='unicode61 remove_diacritics 2'";

export interface RebuildContentlessFtsResult {
  /** 入れ直した caravan_entities_fts の行数（= caravan_entities の行数）。 */
  entities: number;
  /** 入れ直した caravan_episodes_fts の行数（= caravan_episodes の行数）。 */
  episodes: number;
}

function countRows(db: CaravanDbConnection, table: string): number {
  const rows = db.exec(`SELECT COUNT(*) FROM ${table}`);
  return (rows[0]?.values?.[0]?.[0] as number | undefined) ?? 0;
}

/**
 * エンティティ・エピソードの contentless FTS5 索引を drop → create → 全件 INSERT で
 * 作り直す。削除を索引へ反映するために使う（追加・更新だけなら `runRagFtsRebuild` で足りる）。
 *
 * 単一のトランザクションで行う。途中で落ちると索引が空のまま残り、全文検索が無言で
 * 0 件を返す状態になるため。
 */
export function rebuildContentlessFtsIndexes(
  db: CaravanDbConnection,
  logger: CaravanLogger = noopLogger,
): RebuildContentlessFtsResult {
  db.run('BEGIN IMMEDIATE');
  try {
    db.execMany(
      [
        `DROP TABLE IF EXISTS caravan_entities_fts`,
        `DROP TABLE IF EXISTS caravan_episodes_fts`,
        `CREATE VIRTUAL TABLE caravan_entities_fts USING fts5(
           display_name, summary, aliases_text,
           content='', contentless_delete=1, ${FTS_TOKENIZE})`,
        `CREATE VIRTUAL TABLE caravan_episodes_fts USING fts5(
           raw_excerpt, content='', contentless_delete=1, ${FTS_TOKENIZE})`,
        // aliases_text は rag/ftsSync.ts の aliasesJsonToText と同じ契約
        // （JSON 配列の文字列要素のみを空白結合。配列以外・非文字列要素は無視）
        `INSERT INTO caravan_entities_fts (rowid, display_name, summary, aliases_text)
         SELECT rowid, display_name, COALESCE(summary, ''),
           CASE
             WHEN json_valid(aliases_json) AND json_type(aliases_json) = 'array' THEN COALESCE(
               (SELECT group_concat(je.value, ' ') FROM json_each(aliases_json) AS je
                 WHERE je.type = 'text'),
               '')
             ELSE ''
           END
         FROM caravan_entities`,
        `INSERT INTO caravan_episodes_fts (rowid, raw_excerpt)
         SELECT rowid, COALESCE(raw_excerpt, '') FROM caravan_episodes`,
      ].join(';\n'),
    );
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  const result = {
    entities: countRows(db, 'caravan_entities_fts'),
    episodes: countRows(db, 'caravan_episodes_fts'),
  };
  logger.info(
    `[anytime-memory] rebuildContentlessFtsIndexes: entities=${result.entities} ` +
      `episodes=${result.episodes}`,
  );
  return result;
}
