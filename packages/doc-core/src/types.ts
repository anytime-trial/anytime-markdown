/**
 * doc-core の共有型。関係語彙は graph-core を単一ソースとして再利用する。
 */

import type { RelationType } from './relations';
import type { DocSection } from './ingest/splitSections';

export type { RelationType };
export type { DocSection };

/** 正規化済みの型付き関係（from→to）。 */
export interface DocRelation {
  fromPath: string;
  toPath: string;
  type: RelationType;
}

/** ドキュメントのメタ情報（frontmatter 由来）。 */
export interface DocMeta {
  path: string;
  title?: string;
  category?: string;
  type?: string;
  lang?: string;
  excerpt?: string;
}

/** ingest 用に 1 ファイルから抽出した内容。 */
export interface ExtractedDoc extends DocMeta {
  /** 本文プレーンテキスト（FTS・embedding 用）。 */
  body: string;
  /** 型付き関係（正規化済み・traversal 安全な to のみ）。 */
  related: DocRelation[];
  /** 見出し粒度の節（search_sections の FTS 用）。 */
  sections: DocSection[];
  /** 内容ハッシュ（増分判定用）。 */
  contentHash: string;
}

/** 検索結果の 1 行。 */
export interface DocHit {
  path: string;
  title?: string;
  category?: string;
  /** スコア（FTS rank / cosine 等。手段により意味が異なる）。 */
  score?: number;
  /** frontmatter 由来の要約（doc.excerpt）。開かずに関連度判断するための短文。 */
  excerpt?: string;
  /** キーワード一致箇所の抜粋（FTS5 snippet・keyword 検索時のみ）。 */
  snippet?: string;
}

/** 節検索（search_sections）結果の 1 行。 */
export interface SectionHit {
  path: string;
  /** 見出しテキスト（`#` マークなし）。リード節は空文字。 */
  heading: string;
  /** 見出しレベル（1〜6、リード節は 0）。 */
  level: number;
  /** キーワード一致箇所の抜粋（FTS5 snippet）。 */
  snippet?: string;
  /** スコア（FTS5 rank・小さいほど良い）。 */
  score?: number;
}
