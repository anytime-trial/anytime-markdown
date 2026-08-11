import type { CaravanDbConnection } from '../db/connection/types';
import { splitIdentifierSubtokens } from './identifierTokens';

export function aliasesJsonToText(aliasesJson: string | null | undefined): string {
  if (!aliasesJson) return '';
  try {
    const parsed: unknown = JSON.parse(aliasesJson);
    if (!Array.isArray(parsed)) return '';
    return parsed.filter((v): v is string => typeof v === 'string').join(' ');
  } catch {
    return '';
  }
}

/**
 * FTS の aliases_text 列に入れる文字列を組み立てる（B1・memory-core spec §7.4）。
 * aliases に加えて display_name / canonical_name の識別子分割サブトークンを含め、
 * `blockAlignment` のような部分識別子クエリを unicode61 の索引トークンへ届かせる。
 * クエリ側の分割（tokenizeForFts5）と同じ splitIdentifierSubtokens を共有する。
 */
export function buildEntityAliasesText(
  displayName: string | null | undefined,
  canonicalName: string | null | undefined,
  aliasesJson: string | null | undefined,
): string {
  const subtokens = new Set<string>([
    ...splitIdentifierSubtokens(displayName ?? ''),
    ...splitIdentifierSubtokens(canonicalName ?? ''),
  ]);
  return [aliasesJsonToText(aliasesJson), ...subtokens].filter((s) => s.length > 0).join(' ');
}

function getRowid(conn: CaravanDbConnection, table: string, id: string): number | null {
  const r = conn.exec(`SELECT rowid FROM ${table} WHERE id = ?`, [id]);
  const row = r[0]?.values[0];
  if (!row) return null;
  return row[0] as number;
}

export function upsertEntityFts(conn: CaravanDbConnection, entityId: string): void {
  const r = conn.exec(
    `SELECT rowid, display_name, canonical_name, summary, aliases_json
     FROM caravan_entities WHERE id = ?`,
    [entityId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, displayName, canonicalName, summary, aliasesJson] = row;
  conn.run(`DELETE FROM caravan_entities_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO caravan_entities_fts (rowid, display_name, summary, aliases_text)
     VALUES (?, ?, ?, ?)`,
    [
      rowid,
      displayName ?? '',
      summary ?? '',
      buildEntityAliasesText(
        displayName as string | null,
        canonicalName as string | null,
        aliasesJson as string | null,
      ),
    ],
  );
}

export function deleteEntityFts(conn: CaravanDbConnection, entityId: string): void {
  const rowid = getRowid(conn, 'caravan_entities', entityId);
  if (rowid === null) return;
  conn.run(`DELETE FROM caravan_entities_fts WHERE rowid = ?`, [rowid]);
}

export function upsertEpisodeFts(conn: CaravanDbConnection, episodeId: string): void {
  const r = conn.exec(
    `SELECT rowid, raw_excerpt FROM caravan_episodes WHERE id = ?`,
    [episodeId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, rawExcerpt] = row;
  conn.run(`DELETE FROM caravan_episodes_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO caravan_episodes_fts (rowid, raw_excerpt) VALUES (?, ?)`,
    [rowid, rawExcerpt ?? ''],
  );
}

export function deleteEpisodeFts(conn: CaravanDbConnection, episodeId: string): void {
  const rowid = getRowid(conn, 'caravan_episodes', episodeId);
  if (rowid === null) return;
  conn.run(`DELETE FROM caravan_episodes_fts WHERE rowid = ?`, [rowid]);
}

export function upsertDriftFts(conn: CaravanDbConnection, driftId: string): void {
  const r = conn.exec(
    `SELECT rowid, predicate, conversation_value, spec_value, code_value, resolution_note
     FROM caravan_drift_events WHERE id = ?`,
    [driftId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, predicate, convVal, specVal, codeVal, resNote] = row;
  conn.run(`DELETE FROM caravan_drift_events_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO caravan_drift_events_fts
       (rowid, predicate, conversation_value, spec_value, code_value, resolution_note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      rowid,
      predicate ?? '',
      convVal ?? '',
      specVal ?? '',
      codeVal ?? '',
      resNote ?? '',
    ],
  );
}

export function deleteDriftFts(conn: CaravanDbConnection, driftId: string): void {
  const rowid = getRowid(conn, 'caravan_drift_events', driftId);
  if (rowid === null) return;
  conn.run(`DELETE FROM caravan_drift_events_fts WHERE rowid = ?`, [rowid]);
}
