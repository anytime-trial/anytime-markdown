/**
 * Compares LLM extraction quality across models on real Trail DB episodes.
 * Self-contained: inlines the memory-core prompt and zod schema so it runs
 * standalone via `node --experimental-strip-types` without TS path resolution.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://host.docker.internal:11434 \
 *   node --experimental-strip-types packages/memory-core/scripts/evaluate-model-quality.mts \
 *     qwen2.5:7b qwen2.5:3b
 *
 * Optional flags:
 *   --episodes <N>   Sample size (default 20)
 *   --trail <PATH>   Path to trail.db (default ~/.claude/trail/trail.db)
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { z } from 'zod';

interface EvalArgs {
  models: string[];
  episodes: number;
  trailPath: string;
}

function parseArgs(argv: string[]): EvalArgs {
  const models: string[] = [];
  let episodes = 20;
  let trailPath = `${homedir()}/.claude/trail/trail.db`;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episodes') {
      episodes = Number(argv[++i]);
    } else if (a === '--trail') {
      trailPath = argv[++i];
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      models.push(a);
    }
  }
  if (models.length === 0) throw new Error('specify at least one model');
  return { models, episodes, trailPath };
}

// ── Inlined from memory-core/src/canonical/splitEpisodes.ts ──────────────────
const MAX_EXCERPT_BYTES = 2048;

interface Message {
  uuid: string;
  session_id: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  text_excerpt: string;
}

interface Episode {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  valid_from: string;
  raw_excerpt: string;
}

function truncateToBytes(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.byteLength <= maxBytes) return str;
  return buf.subarray(0, maxBytes).toString('utf8').replace(/�$/, '');
}

function splitEpisodes(messages: Message[]): Episode[] {
  const episodes: Episode[] = [];
  const sessionMap = new Map<string, Message[]>();
  for (const m of messages) {
    let bucket = sessionMap.get(m.session_id);
    if (bucket === undefined) {
      bucket = [];
      sessionMap.set(m.session_id, bucket);
    }
    bucket.push(m);
  }
  for (const [session_id, sessionMessages] of sessionMap) {
    const firstUserIdx = sessionMessages.findIndex((m) => m.type === 'user');
    if (firstUserIdx === -1) continue;
    let blockStart = firstUserIdx;
    for (let i = firstUserIdx + 1; i <= sessionMessages.length; i++) {
      const isNewBlock = i === sessionMessages.length || sessionMessages[i].type === 'user';
      if (isNewBlock) {
        const blockMessages = sessionMessages.slice(blockStart, i);
        const firstMsg = blockMessages[0];
        const lastMsg = blockMessages.at(-1) as Message;
        const joined = blockMessages.map((m) => m.text_excerpt).join('\n---\n');
        const raw_excerpt = truncateToBytes(joined, MAX_EXCERPT_BYTES);
        episodes.push({
          session_id,
          message_uuid_start: firstMsg.uuid,
          message_uuid_end: lastMsg.uuid,
          valid_from: firstMsg.timestamp,
          raw_excerpt,
        });
        blockStart = i;
      }
    }
  }
  return episodes;
}

// ── Inlined from memory-core/src/ollama/prompts/conversation.ts ──────────────
const SYSTEM_PROMPT_CORE = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
以下のスキーマに従い、ブロック内に登場する事実を JSON で返してください。

エンティティ型: Person, Project, Package, File, Library, Tool, Concept,
                Decision, Bug, Task, Skill, Rule, Commit, Question
リレーション: prefers, dislikes, depends_on, replaces, relates_to,
              mentioned_in, authored_by, works_on, uses, fixes,
              affects, caused_by, introduced_by,
              asked_by, answered_in

不具合分析（why-why-why 3 段以上）が登場した場合は、
Bug entity と caused_by edge（Bug → 根本原因の Concept / Decision / Rule）を
必ず抽出してください。confidence は LLM 推論なので 0.6〜0.85 の範囲で付与してください。`;

const QUESTION_EXTRACTION_INSTRUCTIONS = `ブロック内のユーザーメッセージに疑問符が 1 つ以上含まれており、かつ
仕様 / 設計 / 実装の確認意図がある場合（「〜は…でしょうか？」「〜に含まれていますか？」
「どう動きますか？」等）は、Question entity を抽出してください:
  - text: 質問文（要約せず原文ベース、200 文字以内）
  - target_spec_path: c4Scope や本文中の spec/... バッククォート path から逆引き可能なら
                     最も関連する spec doc の rel_path、無ければ null
  - target_symbol: 関連する関数名 / クラス名 / ファイル名があれば、無ければ null
  - asked_by: ユーザーの canonical_name（既知なら "ueda" 等）
  - answered_in: この episode 内で回答が完結したら true、続く episode に持ち越すなら false

雑談や AI への単純指示（「〜して」「〜お願い」）は Question として抽出しません。
疑問符が含まれていても回答が不要な修辞疑問・確認発話（「いいですか？」「OK?」等）は除外します。`;

const QUESTION_SKIP_INSTRUCTION = `Question entity は抽出しません。`;

const OUTPUT_INSTRUCTIONS = `出力例 (summary は必須、aliases/tags/attributes/valid_from 等は値が無ければ省略):
{"summary":"ブロック全体の1〜2文要約","entities":[{"type":"Library","name":"react"}],"relations":[{"subject":{"type":"Person","name":"ueda"},"predicate":"prefers","object":{"type":"Concept","name":"Conventional Commits"},"confidence":0.9}]}

valid_from は会話内に時間表現があれば ISO 8601 で付与、無ければ省略。
JSON のみを返してください:`;

function hasQuestionMark(text: string): boolean {
  return /[?？]/.test(text);
}

function buildPrompt(episode: Episode): string {
  const sys = [
    SYSTEM_PROMPT_CORE,
    hasQuestionMark(episode.raw_excerpt) ? QUESTION_EXTRACTION_INSTRUCTIONS : QUESTION_SKIP_INSTRUCTION,
    OUTPUT_INSTRUCTIONS,
  ].join('\n\n');
  return `${sys}\n\n${episode.raw_excerpt}`;
}

// ── Inlined from memory-core/src/ingest/conversation/extractFacts.ts ─────────
const EntitySchema = z.object({
  type: z.enum([
    'Person', 'Project', 'Package', 'File', 'Library', 'Tool', 'Concept',
    'Decision', 'Bug', 'Task', 'Skill', 'Rule', 'Commit', 'Question',
  ]),
  name: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  attributes: z.record(z.string(), z.unknown()).optional().default({}),
});

const RelationEndpointSchema = z.object({ type: z.string(), name: z.string() });

const RelationSchema = z.object({
  subject: RelationEndpointSchema,
  predicate: z.enum([
    'prefers', 'dislikes', 'depends_on', 'replaces', 'relates_to',
    'mentioned_in', 'authored_by', 'works_on', 'uses', 'fixes',
    'affects', 'caused_by', 'introduced_by', 'asked_by', 'answered_in',
  ]),
  object: RelationEndpointSchema,
  valid_from: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.8),
});

const QuestionSchema = z.object({
  text: z.string(),
  target_spec_path: z.string().nullable().optional(),
  target_symbol: z.string().nullable().optional(),
  asked_by: z.string().optional(),
  answered_in: z.boolean().optional(),
});

const ExtractionResultSchema = z.object({
  summary: z.string().nullable().optional().transform((v) => v ?? ''),
  entities: z.array(EntitySchema.catch(null as unknown as z.infer<typeof EntitySchema>))
    .optional().default([])
    .transform((arr) => arr.filter((x): x is z.infer<typeof EntitySchema> => x !== null)),
  relations: z.array(RelationSchema.catch(null as unknown as z.infer<typeof RelationSchema>))
    .optional().default([])
    .transform((arr) => arr.filter((x): x is z.infer<typeof RelationSchema> => x !== null)),
  questions: z.array(QuestionSchema).optional().default([]),
});

// ── Ollama HTTP client (inlined) ─────────────────────────────────────────────
function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function ollamaGenerate(baseUrl: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
  });
  if (!res.ok) throw new Error(`ollama_http_${res.status}`);
  const data = (await res.json()) as { response?: string; thinking?: string };
  return stripThinkingBlocks(data.response || data.thinking || '');
}

// ── Episode sampling ─────────────────────────────────────────────────────────
interface SampleEpisode extends Episode {
  excerpt_bytes: number;
}

async function loadEpisodes(trailPath: string, count: number): Promise<SampleEpisode[]> {
  const SQL = await initSqlJs();
  const data = readFileSync(trailPath);
  const trail = new SQL.Database(data);
  const sinceISO = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const stmt = trail.prepare(
    `SELECT m.uuid, m.session_id, m.type, m.timestamp,
            COALESCE(SUBSTR(m.text_content,1,2048), SUBSTR(m.user_content,1,2048), '') AS text_excerpt
     FROM messages m
     WHERE m.timestamp IS NOT NULL AND m.timestamp >= ?
       AND m.type IN ('user','assistant','system')
     ORDER BY m.session_id, m.timestamp`,
  );
  stmt.bind([sinceISO]);
  const messages: Message[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const t = row['type'] as string;
    if (t !== 'user' && t !== 'assistant' && t !== 'system') continue;
    messages.push({
      uuid: row['uuid'] as string,
      session_id: row['session_id'] as string,
      type: t,
      timestamp: row['timestamp'] as string,
      text_excerpt: (row['text_excerpt'] as string | null) ?? '',
    });
  }
  stmt.free();
  trail.close();

  const allEpisodes = splitEpisodes(messages);
  const meaningful = allEpisodes.filter((ep) => Buffer.byteLength(ep.raw_excerpt, 'utf8') >= 200);
  const sampled: SampleEpisode[] = [];
  if (meaningful.length === 0) return sampled;
  const step = Math.max(1, Math.floor(meaningful.length / count));
  for (let i = 0; i < meaningful.length && sampled.length < count; i += step) {
    sampled.push({ ...meaningful[i], excerpt_bytes: Buffer.byteLength(meaningful[i].raw_excerpt, 'utf8') });
  }
  return sampled;
}

// ── Evaluation loop ──────────────────────────────────────────────────────────
interface PerEpisodeResult {
  model: string;
  episode_idx: number;
  excerpt_bytes: number;
  success: boolean;
  latency_ms: number;
  entities: number;
  relations: number;
  questions: number;
  json_parse_ok: boolean;
  zod_ok: boolean;
  empty_response: boolean;
  failure_reason?: string;
}

async function evaluateModel(
  model: string,
  episodes: SampleEpisode[],
  baseUrl: string,
): Promise<PerEpisodeResult[]> {
  const results: PerEpisodeResult[] = [];
  process.stderr.write(`[${model}] warm-up...\n`);
  try {
    await ollamaGenerate(baseUrl, model, 'return {"ok":true} as JSON.');
  } catch (e) {
    process.stderr.write(`[${model}] warm-up err: ${(e as Error).message}\n`);
  }

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const prompt = buildPrompt(ep);
    let success = false;
    let entities = 0;
    let relations = 0;
    let questions = 0;
    let jsonParseOk = false;
    let zodOk = false;
    let emptyResponse = false;
    let failureReason: string | undefined;
    const t0 = Date.now();
    try {
      const responseText = await ollamaGenerate(baseUrl, model, prompt);
      if (!responseText) {
        emptyResponse = true;
        failureReason = 'empty_response';
      } else {
        try {
          const parsed = JSON.parse(responseText);
          jsonParseOk = true;
          const v = ExtractionResultSchema.safeParse(parsed);
          if (v.success) {
            zodOk = true;
            success = true;
            entities = v.data.entities.length;
            relations = v.data.relations.length;
            questions = v.data.questions.length;
          } else {
            failureReason = `zod:${(v.error.message ?? '').slice(0, 80)}`;
          }
        } catch (e) {
          failureReason = `json_parse:${(e as Error).message.slice(0, 80)}`;
        }
      }
    } catch (e) {
      failureReason = `http:${(e as Error).message.slice(0, 80)}`;
    }
    const latency_ms = Date.now() - t0;
    process.stderr.write(
      `[${model}] ep ${i + 1}/${episodes.length} (${ep.excerpt_bytes}B) ${success ? '✓' : '✗'} ${latency_ms}ms ent=${entities} rel=${relations} q=${questions}${failureReason ? ` why=${failureReason}` : ''}\n`,
    );
    results.push({
      model,
      episode_idx: i,
      excerpt_bytes: ep.excerpt_bytes,
      success,
      latency_ms,
      entities,
      relations,
      questions,
      json_parse_ok: jsonParseOk,
      zod_ok: zodOk,
      empty_response: emptyResponse,
      failure_reason: failureReason,
    });
  }
  return results;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function summarize(model: string, results: PerEpisodeResult[]) {
  const succ = results.filter((r) => r.success);
  return {
    model,
    n: results.length,
    success_rate: results.length === 0 ? 0 : succ.length / results.length,
    json_parse_rate: results.length === 0 ? 0 : results.filter((r) => r.json_parse_ok).length / results.length,
    zod_rate: results.length === 0 ? 0 : results.filter((r) => r.zod_ok).length / results.length,
    latency_ms_p50: median(succ.map((r) => r.latency_ms)),
    latency_ms_mean: mean(succ.map((r) => r.latency_ms)),
    entities_mean: mean(succ.map((r) => r.entities)),
    relations_mean: mean(succ.map((r) => r.relations)),
    questions_mean: mean(succ.map((r) => r.questions)),
    entities_p50: median(succ.map((r) => r.entities)),
    relations_p50: median(succ.map((r) => r.relations)),
    failures: results.filter((r) => !r.success).map((r) => ({ idx: r.episode_idx, reason: r.failure_reason })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
  process.stderr.write(`Loading episodes from ${args.trailPath}...\n`);
  const episodes = await loadEpisodes(args.trailPath, args.episodes);
  process.stderr.write(`Sampled ${episodes.length} episodes (target ${args.episodes})\n`);
  if (episodes.length === 0) {
    process.stderr.write('No meaningful episodes found in window.\n');
    process.exit(1);
  }
  const summaries: ReturnType<typeof summarize>[] = [];
  const allResults: PerEpisodeResult[] = [];
  for (const model of args.models) {
    process.stderr.write(`\n=== Evaluating ${model} ===\n`);
    const r = await evaluateModel(model, episodes, baseUrl);
    summaries.push(summarize(model, r));
    allResults.push(...r);
  }
  process.stdout.write(JSON.stringify({ summaries, episode_count: episodes.length, results: allResults }, null, 2));
  process.stdout.write('\n');
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
