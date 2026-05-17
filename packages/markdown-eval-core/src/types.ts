/**
 * markdown-eval-core 型定義。
 * anytime-reverse-spec が生成した markdown 設計書を golden ベースと
 * 章単位でペア化し、3 軸 (Intent / Design / Completeness) で採点する。
 */

export interface GoldenFile {
  /** candidate からの相対パス (例: "01-system-overview.ja.md") */
  relativePath: string;
  /** ファイル本文 (git show の出力をそのまま渡す想定) */
  content: string;
}

export interface EvaluateReverseSpecInput {
  /** golden 側ファイル群 */
  goldenFiles: readonly GoldenFile[];
  /** candidate ディレクトリ絶対パス */
  candidateDir: string;
  /**
   * ペアリング対象ファイルの glob (省略時 "**\/*.ja.md")。
   * fast-glob 構文。candidateDir からの相対。
   */
  documentGlob?: string;
  /** ペアリング除外パターン (省略時 ["_eval/**"]) */
  excludeGlobs?: readonly string[];
  /** excerpt 切り出し上限 char 数 (省略時 15000) */
  maxExcerptChars?: number;
}

export interface HeuristicScore {
  /** 本文トークン (stopword 除去) の TF コサイン類似度 0..1 */
  intent: number;
  /** 0.6 × 識別子 Jaccard + 0.4 × 見出し Jaccard 0..1 */
  design: number;
  /** golden 見出しの candidate 包含率 0..1 */
  completeness: number;
}

export interface DocumentPair {
  /** candidateDir からの相対パス */
  file: string;
  /** heuristic スコア */
  heuristic: HeuristicScore;
  /** golden 抜粋 (maxExcerptChars で truncate 済み) */
  golden_excerpt: string;
  /** candidate 抜粋 (maxExcerptChars で truncate 済み) */
  candidate_excerpt: string;
  /** どちらが truncate されたか */
  truncated: { golden: boolean; candidate: boolean };
}

export interface EvaluateReverseSpecOutput {
  /** ペア化された章 */
  pairs: DocumentPair[];
  /** 片側のみ存在する章 */
  unmatched: {
    /** golden にのみ存在 (削除された章の候補) */
    reference: string[];
    /** candidate にのみ存在 (追加された章の候補) */
    candidate: string[];
  };
  /** 実行メタデータ */
  meta: {
    golden_count: number;
    candidate_count: number;
    document_glob: string;
    exclude_globs: readonly string[];
    max_excerpt_chars: number;
  };
}
