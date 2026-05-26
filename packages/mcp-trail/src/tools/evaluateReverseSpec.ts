import { z } from 'zod';

import {
  evaluateReverseSpec,
} from '@anytime-markdown/markdown-eval-core';
import type {
  EvaluateReverseSpecOutput,
} from '@anytime-markdown/markdown-eval-core';

export const EvaluateReverseSpecInputSchema = z.object({
  goldenFiles: z
    .array(
      z.object({
        relativePath: z.string().describe('candidate からの相対パス (例: "01-system-overview.ja.md")'),
        content: z.string().describe('ファイル本文。git show HEAD:... の出力をそのまま渡す'),
      }),
    )
    .describe('golden 側ファイル群'),
  candidateDir: z.string().describe('candidate ディレクトリの絶対パス'),
  documentGlob: z
    .string()
    .optional()
    .describe('ペアリング対象の fast-glob パターン (default: "**/*.ja.md")'),
  excludeGlobs: z
    .array(z.string())
    .optional()
    .describe('除外する fast-glob パターン (default: ["_eval/**"])'),
  maxExcerptChars: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('excerpt 切り出し上限文字数 (default: 15000)'),
});

export type EvaluateReverseSpecToolInput = z.infer<typeof EvaluateReverseSpecInputSchema>;

/**
 * MCP ツール evaluate_reverse_spec の handler。
 * markdown-eval-core を呼ぶ薄いラッパー。LLM 推論は行わず、
 * ペアリング + heuristic スコア + excerpt のみを返す。
 */
export async function handleEvaluateReverseSpec(
  input: EvaluateReverseSpecToolInput,
): Promise<EvaluateReverseSpecOutput> {
  return evaluateReverseSpec(input);
}
