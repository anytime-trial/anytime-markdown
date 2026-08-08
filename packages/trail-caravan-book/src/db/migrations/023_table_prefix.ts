import { planTableRenames, type TableRename } from '@anytime-markdown/trail-activity';
import type { MemoryDbConnection } from '../connection/types';

/**
 * 023/024: caravan-book.db の runner 管理テーブルを caravan_ 接頭辞へ改名する。
 *
 * SQL ファイルでなく code migration にするのは、ALTER TABLE に IF EXISTS が無く、
 * 「migration 本体 COMMIT 後・_migrations 記帳前」のクラッシュ窓で再実行されたとき
 * SQL 直書きだと no such table で起動不能になるため（存在ガードで冪等化する）。
 * Flight Record 系 5 表（instructions 等）は FlightRecordDatabase / mcp-trail サイドカーの
 * open 経路が改名するため、ここでは扱わない（tablePrefixMigration.ts の分担コメント参照）。
 */

const CARAVAN_RUNNER_TABLE_RENAMES: readonly TableRename[] = [
  ...[
    'memory_bug_fixes',
    'memory_code_facts',
    'memory_drift_events',
    'memory_edge_invalidations',
    'memory_edges',
    'memory_entities',
    'memory_episode_entities',
    'memory_episodes',
    'memory_failed_items',
    'memory_pipeline_state',
    'memory_relation_types',
    'memory_review_findings',
    'memory_review_runs',
    'memory_reviews',
    'memory_spec_doc_entities',
    'memory_spec_documents',
  ].map((from) => ({ from, to: from.replace(/^memory_/, 'caravan_') })),
  { from: 'pipeline_runs', to: 'caravan_pipeline_runs' },
  { from: 'pipeline_run_logs', to: 'caravan_pipeline_run_logs' },
];

function listTables(conn: MemoryDbConnection): Set<string> {
  const result = conn.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  return new Set((result[0]?.values ?? []).map((r) => String(r[0])));
}

export function applyTablePrefix(conn: MemoryDbConnection): void {
  const statements = planTableRenames(listTables(conn), CARAVAN_RUNNER_TABLE_RENAMES);
  if (statements.length === 0) return;
  // FK 有効時のみ他テーブルの REFERENCES 句が新名へ書き換わるため、改名中は明示的に ON にする
  // (PRAGMA foreign_keys はトランザクション内では no-op なので BEGIN の前に置く)
  conn.execMany('PRAGMA foreign_keys = ON');
  conn.execMany(['BEGIN', ...statements, 'COMMIT'].join(';\n'));
}

const FTS_TOKENIZE = `tokenize='unicode61 remove_diacritics 2'`;

export function applyTablePrefixFts(conn: MemoryDbConnection): void {
  // 旧 FTS は contentless (content='') で中身を SELECT できないため、rename でなく
  // DROP → 新名 CREATE → ベーステーブルから全再構成する（contentless FTS への一括
  // rowid 差分操作は DB 破損の既知罠のため、再構築方式に固定）。新名側も DROP して
  // クラッシュ窓での再実行を冪等にする。
  conn.execMany(
    [
      'BEGIN',
      `DROP TABLE IF EXISTS memory_entities_fts`,
      `DROP TABLE IF EXISTS memory_episodes_fts`,
      `DROP TABLE IF EXISTS memory_drift_events_fts`,
      `DROP TABLE IF EXISTS caravan_entities_fts`,
      `DROP TABLE IF EXISTS caravan_episodes_fts`,
      `DROP TABLE IF EXISTS caravan_drift_events_fts`,
      `CREATE VIRTUAL TABLE caravan_entities_fts USING fts5(
         display_name, summary, aliases_text,
         content='', contentless_delete=1, ${FTS_TOKENIZE})`,
      `CREATE VIRTUAL TABLE caravan_episodes_fts USING fts5(
         raw_excerpt, content='', contentless_delete=1, ${FTS_TOKENIZE})`,
      `CREATE VIRTUAL TABLE caravan_drift_events_fts USING fts5(
         predicate, conversation_value, spec_value, code_value, resolution_note,
         content='', contentless_delete=1, ${FTS_TOKENIZE})`,
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
      `INSERT INTO caravan_drift_events_fts
         (rowid, predicate, conversation_value, spec_value, code_value, resolution_note)
       SELECT rowid, COALESCE(predicate, ''), COALESCE(conversation_value, ''),
              COALESCE(spec_value, ''), COALESCE(code_value, ''), COALESCE(resolution_note, '')
       FROM caravan_drift_events`,
      'COMMIT',
    ].join(';\n'),
  );
}
