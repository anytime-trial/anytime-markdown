import type { MemoryDbConnection } from '../db/connection/types';

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

function getRowid(conn: MemoryDbConnection, table: string, id: string): number | null {
  const r = conn.exec(`SELECT rowid FROM ${table} WHERE id = ?`, [id]);
  const row = r[0]?.values[0];
  if (!row) return null;
  return row[0] as number;
}

export function upsertEntityFts(conn: MemoryDbConnection, entityId: string): void {
  const r = conn.exec(
    `SELECT rowid, display_name, summary, aliases_json
     FROM memory_entities WHERE id = ?`,
    [entityId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, displayName, summary, aliasesJson] = row;
  conn.run(`DELETE FROM memory_entities_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO memory_entities_fts (rowid, display_name, summary, aliases_text)
     VALUES (?, ?, ?, ?)`,
    [
      rowid,
      displayName ?? '',
      summary ?? '',
      aliasesJsonToText(aliasesJson as string | null),
    ],
  );
}

export function deleteEntityFts(conn: MemoryDbConnection, entityId: string): void {
  const rowid = getRowid(conn, 'memory_entities', entityId);
  if (rowid === null) return;
  conn.run(`DELETE FROM memory_entities_fts WHERE rowid = ?`, [rowid]);
}

export function upsertEpisodeFts(conn: MemoryDbConnection, episodeId: string): void {
  const r = conn.exec(
    `SELECT rowid, raw_excerpt FROM memory_episodes WHERE id = ?`,
    [episodeId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, rawExcerpt] = row;
  conn.run(`DELETE FROM memory_episodes_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO memory_episodes_fts (rowid, raw_excerpt) VALUES (?, ?)`,
    [rowid, rawExcerpt ?? ''],
  );
}

export function deleteEpisodeFts(conn: MemoryDbConnection, episodeId: string): void {
  const rowid = getRowid(conn, 'memory_episodes', episodeId);
  if (rowid === null) return;
  conn.run(`DELETE FROM memory_episodes_fts WHERE rowid = ?`, [rowid]);
}

export function upsertDriftFts(conn: MemoryDbConnection, driftId: string): void {
  const r = conn.exec(
    `SELECT rowid, predicate, conversation_value, spec_value, code_value, resolution_note
     FROM memory_drift_events WHERE id = ?`,
    [driftId],
  );
  const row = r[0]?.values[0];
  if (!row) return;
  const [rowid, predicate, convVal, specVal, codeVal, resNote] = row;
  conn.run(`DELETE FROM memory_drift_events_fts WHERE rowid = ?`, [rowid]);
  conn.run(
    `INSERT INTO memory_drift_events_fts
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

export function deleteDriftFts(conn: MemoryDbConnection, driftId: string): void {
  const rowid = getRowid(conn, 'memory_drift_events', driftId);
  if (rowid === null) return;
  conn.run(`DELETE FROM memory_drift_events_fts WHERE rowid = ?`, [rowid]);
}
