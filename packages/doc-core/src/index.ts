// @anytime-markdown/doc-core — ドキュメント検索（構造=型付き関係 / 意味=embedding / キーワード=FTS5）

export type { RelationType, DocRelation, DocMeta, ExtractedDoc, DocHit, DocSection, SectionHit } from './types';
export { RELATION_TYPES, DEFAULT_RELATION_TYPE, isRelationType, coerceRelationType } from './relations';

// DB
export { openDocDb, type DocDb } from './db/open';
export { getTrailHome, getDocCoreDbPath } from './db/paths';
export { runMigrations } from './db/migrations/runner';

// ingest
export { extractDoc, isSafeRelPath } from './ingest/extractDoc';
export { discoverDocs, type DiscoveredDoc } from './ingest/discoverDocs';
export { persistDoc, getStoredHash } from './ingest/persist';
export { ingestDocs, type IngestResult, type IngestOptions } from './ingest/ingestDocs';

// retrieve（構造・キーワード。意味検索 searchSemantic は Phase 2）
export {
  backlinks,
  forwardLinks,
  neighbors,
  byCategory,
  type RelationEdge,
  type NeighborOptions,
} from './retrieve/structural';
export { searchFts, toFtsMatch } from './retrieve/fts';
export { searchDocs, type SearchDocsOptions } from './retrieve/searchDocs';
export { searchSections, type SearchSectionsOptions } from './retrieve/searchSections';
export { splitSections } from './ingest/splitSections';
export { searchSemantic } from './retrieve/semantic';

// embedding（注入式 EmbedFn。daemon が ollama bge-m3 を、テストが fake を供給）
export {
  embedDocs,
  DEFAULT_MAX_EMBED_CHARS,
  type EmbedFn,
  type EmbedOptions,
  type EmbedResult,
} from './embedding/embedDocs';
export { cosineSim } from './embedding/cosine';
export { float32ToBlob, blobToFloat32 } from './embedding/blob';
