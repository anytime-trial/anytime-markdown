import type { CaravanDbConnection } from '../connection/types';
import { FTS_TOKENIZE } from './023_table_prefix';
import { buildEntityAliasesText } from '../../rag/ftsSync';

/**
 * 030: エンティティ FTS へ識別子分割サブトークンを取り込む再構築（B1・
 * memory-core spec §7.4）。aliases_text の組み立てが buildEntityAliasesText
 * （識別子分割込み）へ変わったため、既存全行を新契約で再索引する。
 *
 * contentless FTS5 への一括 rowid 差分操作は DB 破損の既知罠のため、
 * 024 と同じ DROP → CREATE → 全再投入方式に固定する。aliases_text の
 * 組み立てが JS 関数（splitIdentifierSubtokens）を要するため SQL 単体では
 * 書けず、code 移行にしている。
 */
export function applyFtsIdentifierTokens(conn: CaravanDbConnection): void {
  conn.execMany(
    [
      'BEGIN',
      `DROP TABLE IF EXISTS caravan_entities_fts`,
      `CREATE VIRTUAL TABLE caravan_entities_fts USING fts5(
         display_name, summary, aliases_text,
         content='', contentless_delete=1, ${FTS_TOKENIZE})`,
    ].join(';\n'),
  );
  const rows = conn.exec(
    `SELECT rowid, display_name, canonical_name, summary, aliases_json FROM caravan_entities`,
  );
  for (const row of rows[0]?.values ?? []) {
    const [rowid, displayName, canonicalName, summary, aliasesJson] = row;
    conn.run(
      `INSERT INTO caravan_entities_fts (rowid, display_name, summary, aliases_text)
       VALUES (?, ?, ?, ?)`,
      [
        rowid,
        (displayName as string | null) ?? '',
        (summary as string | null) ?? '',
        buildEntityAliasesText(
          displayName as string | null,
          canonicalName as string | null,
          aliasesJson as string | null,
        ),
      ],
    );
  }
  conn.execMany('COMMIT');
}
