import { z } from 'zod';

export const AgentReviewFindingSchema = z.object({
  finding_index: z.number().int().nonnegative(),
  category: z.enum(['design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other']),
  severity: z.enum(['info', 'warn', 'error']),
  target_file_path: z.string().nullable(),
  target_symbol: z.string().nullable(),
  target_line_start: z.number().int().nullable(),
  target_line_end: z.number().int().nullable(),
  finding_text: z.string(),
  suggestion_text: z.string(),
  confidence: z.number().min(0).max(1),
});

export const AgentReviewInputSchema = z.object({
  run_id: z.string().uuid(),
  trigger_kind: z.enum(['cron', 'hook', 'manual', 'mcp']),
  target_kind: z.enum(['spec', 'code', 'package', 'mixed']),
  target_refs: z.array(z.string()),
  model: z.string(),
  prompt_kind: z.enum(['a11y', 'security', 'perf', 'spec_drift', 'naming', 'logic', 'multi']),
  prompt_hash: z.string(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  gpu_used: z.string(),
  ollama_endpoint: z.string().url(),
  findings: z.array(AgentReviewFindingSchema),
});

export type AgentReviewInput = z.infer<typeof AgentReviewInputSchema>;
export type AgentReviewFinding = z.infer<typeof AgentReviewFindingSchema>;
