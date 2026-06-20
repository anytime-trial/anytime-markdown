/**
 * doc-core の共有型。関係語彙は graph-core を単一ソースとして再利用する。
 */

import type { RelationType } from './relations';

export type { RelationType };

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
}
