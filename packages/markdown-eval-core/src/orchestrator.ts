import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listDocuments, pairDocuments } from './document';
import { truncate } from './excerpt';
import { scoreHeuristic } from './heuristic';
import type { DocumentPair, EvaluateReverseSpecInput, EvaluateReverseSpecOutput } from './types';

const DEFAULT_DOCUMENT_GLOB = '**/*.ja.md';
const DEFAULT_EXCLUDE_GLOBS: readonly string[] = ['_eval/**'];
const DEFAULT_MAX_EXCERPT_CHARS = 15000;

/**
 * markdown-eval-core のエントリポイント。
 * golden 側ファイル (content 付き) と candidate ディレクトリを受け取り、
 * 章ペアリング + heuristic 採点 + excerpt 切り出しを行う。
 *
 * LLM 推論は呼び出し側 (Claude セッション本体) で行う想定のため、
 * このモジュールは純粋に I/O + 文字列処理のみ。
 */
export async function evaluateReverseSpec(
  input: EvaluateReverseSpecInput,
): Promise<EvaluateReverseSpecOutput> {
  const documentGlob = input.documentGlob ?? DEFAULT_DOCUMENT_GLOB;
  const excludeGlobs = input.excludeGlobs ?? DEFAULT_EXCLUDE_GLOBS;
  const maxExcerptChars = input.maxExcerptChars ?? DEFAULT_MAX_EXCERPT_CHARS;

  const candidatePaths = await listDocuments(input.candidateDir, documentGlob, excludeGlobs);
  const { matched, unmatchedReference, unmatchedCandidate } = pairDocuments(
    input.goldenFiles,
    candidatePaths,
  );

  const pairs: DocumentPair[] = [];
  for (const m of matched) {
    const candidateAbsPath = join(input.candidateDir, m.candidateRelativePath);
    let candidateContent: string;
    try {
      candidateContent = readFileSync(candidateAbsPath, 'utf8');
    } catch (err) {
      // ペアリング後に candidate ファイルが消えた等、稀なレースを許容しスキップ
      console.error(
        `[markdown-eval-core] failed to read candidate ${candidateAbsPath}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    const heuristic = scoreHeuristic(m.golden.content, candidateContent);
    const goldenExcerpt = truncate(m.golden.content, maxExcerptChars);
    const candidateExcerpt = truncate(candidateContent, maxExcerptChars);

    pairs.push({
      file: m.relativePath,
      heuristic,
      golden_excerpt: goldenExcerpt.content,
      candidate_excerpt: candidateExcerpt.content,
      truncated: {
        golden: goldenExcerpt.truncated,
        candidate: candidateExcerpt.truncated,
      },
    });
  }

  return {
    pairs,
    unmatched: {
      reference: unmatchedReference,
      candidate: unmatchedCandidate,
    },
    meta: {
      golden_count: input.goldenFiles.length,
      candidate_count: candidatePaths.length,
      document_glob: documentGlob,
      exclude_globs: excludeGlobs,
      max_excerpt_chars: maxExcerptChars,
    },
  };
}
