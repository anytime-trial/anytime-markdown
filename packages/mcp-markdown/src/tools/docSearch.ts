/**
 * catalog.db（markdown 拡張が ingest で構築）を読み取り専用で開き、検索を提供する。
 * DB パスは env `ANYTIME_MARKDOWN_DOC_DB`、無ければ `<rootDir>/.anytime/markdown/catalog.db`。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  openDocDb,
  searchDocs,
  searchSections,
  backlinks,
  neighbors,
  isRelationType,
  type DocDb,
  type SearchDocsOptions,
  type SearchSectionsOptions,
  type RelationType,
} from '@anytime-markdown/doc-core';

export function resolveDocDbPath(rootDir: string): string {
  return process.env.ANYTIME_MARKDOWN_DOC_DB ?? path.join(rootDir, '.anytime', 'markdown', 'catalog.db');
}

let cached: { path: string; db: DocDb } | null = null;

function openReadonly(rootDir: string): DocDb {
  let dbPath = resolveDocDbPath(rootDir);
  if (!fs.existsSync(dbPath)) {
    // DB ファイル名変更（doc-core.db→catalog.db・2026-08-08）移行前のワークスペースでは旧名へ
    // フォールバックする（読み取り専用サイドカーは物理リネームしない。owner は ingest 側）。
    const legacyPath = path.join(path.dirname(dbPath), 'doc-core.db');
    if (fs.existsSync(legacyPath)) dbPath = legacyPath;
  }
  if (cached && cached.path === dbPath) return cached.db;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `doc-core index not found at ${dbPath}. ` +
        `Build it first via the markdown extension ("Rebuild Doc Search Index") or set ANYTIME_MARKDOWN_DOC_DB.`,
    );
  }
  const db = openDocDb(dbPath, { readonly: true });
  cached = { path: dbPath, db };
  return db;
}

export function runSearchDocs(rootDir: string, opts: SearchDocsOptions): unknown {
  return searchDocs(openReadonly(rootDir), opts);
}

export function runSearchSections(rootDir: string, opts: SearchSectionsOptions): unknown {
  return searchSections(openReadonly(rootDir), opts);
}

export function runBacklinks(rootDir: string, target: string, type?: string): unknown {
  const relType: RelationType | undefined = type && isRelationType(type) ? type : undefined;
  return backlinks(openReadonly(rootDir), target, relType);
}

export function runNeighbors(rootDir: string, center: string, hops?: number): unknown {
  return neighbors(openReadonly(rootDir), center, { hops });
}
