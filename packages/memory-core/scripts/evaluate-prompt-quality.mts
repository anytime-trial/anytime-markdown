/**
 * Compares baseline vs improved prompts on the same 20 episodes with a single model.
 * Self-contained (no path-resolved imports).
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://host.docker.internal:11434 \
 *   node --experimental-strip-types packages/memory-core/scripts/evaluate-prompt-quality.mts \
 *     [--model qwen2.5:7b] [--episodes 20]
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { z } from 'zod';

interface Args { model: string; episodes: number; trailPath: string; }
function parseArgs(argv: string[]): Args {
  let model = 'qwen2.5:7b';
  let episodes = 20;
  let trailPath = `${homedir()}/.claude/trail/trail.db`;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') model = argv[++i];
    else if (a === '--episodes') episodes = Number(argv[++i]);
    else if (a === '--trail') trailPath = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
  }
  return { model, episodes, trailPath };
}

const MAX_EXCERPT_BYTES = 2048;
interface Message { uuid: string; session_id: string; type: 'user'|'assistant'|'system'; timestamp: string; text_excerpt: string; }
interface Episode { session_id: string; message_uuid_start: string; message_uuid_end: string; valid_from: string; raw_excerpt: string; }

function truncateToBytes(s: string, n: number): string {
  const b = Buffer.from(s, 'utf8');
  return b.byteLength <= n ? s : b.subarray(0, n).toString('utf8').replace(/�$/, '');
}
function splitEpisodes(messages: Message[]): Episode[] {
  const out: Episode[] = [];
  const sm = new Map<string, Message[]>();
  for (const m of messages) { if (!sm.has(m.session_id)) sm.set(m.session_id, []); sm.get(m.session_id)!.push(m); }
  for (const [sid, ms] of sm) {
    const f = ms.findIndex(m => m.type === 'user'); if (f === -1) continue;
    let bs = f;
    for (let i = f + 1; i <= ms.length; i++) {
      if (i === ms.length || ms[i].type === 'user') {
        const bm = ms.slice(bs, i);
        out.push({
          session_id: sid,
          message_uuid_start: bm[0].uuid,
          message_uuid_end: bm.at(-1)!.uuid,
          valid_from: bm[0].timestamp,
          raw_excerpt: truncateToBytes(bm.map(m => m.text_excerpt).join('\n---\n'), MAX_EXCERPT_BYTES),
        });
        bs = i;
      }
    }
  }
  return out;
}

// ── Baseline prompt (current memory-core implementation) ─────────────────────
const BASELINE_SYS = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
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
const BASELINE_QSKIP = `Question entity は抽出しません。`;
const BASELINE_QGUIDE = `ブロック内のユーザーメッセージに疑問符が 1 つ以上含まれており、かつ
仕様 / 設計 / 実装の確認意図がある場合は Question entity を抽出してください。`;
const BASELINE_OUT = `出力例 (summary は必須):
{"summary":"...","entities":[{"type":"Library","name":"react"}],"relations":[{"subject":{"type":"Person","name":"ueda"},"predicate":"prefers","object":{"type":"Concept","name":"Conventional Commits"},"confidence":0.9}]}
JSON のみを返してください:`;

function buildBaseline(ep: Episode): string {
  const sys = [BASELINE_SYS, /[?？]/.test(ep.raw_excerpt) ? BASELINE_QGUIDE : BASELINE_QSKIP, BASELINE_OUT].join('\n\n');
  return `${sys}\n\n${ep.raw_excerpt}`;
}

// ── Improved prompt: 5 strict rules to fix observed failures ─────────────────
const IMPROVED_SYS = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
以下のスキーマに従い、ブロック内に登場する事実を JSON で返してください。

【厳守ルール】
1. summary は必ず日本語で記述してください。英語や中国語は禁止です。
2. relations の subject / object は、必ず entities[] で先に列挙した (type, name) を参照してください。entities[] にない概念を relation の subject/object に使わないでください。
3. 同じ (subject.type, subject.name, predicate, object.type, object.name) の組み合わせは 1 回だけ出力してください。重複や類似の繰り返しは禁止です。
4. caused_by edge の subject は必ず Bug 型のエンティティに限定してください。
5. relations の subject.name / object.name に "undefined"、null、空文字、未定義の値を含めないでください。

エンティティ型: Person, Project, Package, File, Library, Tool, Concept,
                Decision, Bug, Task, Skill, Rule, Commit, Question
リレーション述語: prefers, dislikes, depends_on, replaces, relates_to,
              mentioned_in, authored_by, works_on, uses, fixes,
              affects, caused_by, introduced_by,
              asked_by, answered_in

不具合分析（why-why-why 3 段以上）が登場した場合は、
Bug entity と caused_by edge（Bug → 根本原因の Concept / Decision / Rule）を
必ず抽出してください。confidence は LLM 推論なので 0.6〜0.85 の範囲で付与してください。`;
const IMPROVED_QSKIP = `Question entity は抽出しません。`;
const IMPROVED_QGUIDE = `ブロック内のユーザーメッセージに疑問符が 1 つ以上含まれており、かつ
仕様 / 設計 / 実装の確認意図がある場合は Question entity を抽出してください。`;
const IMPROVED_OUT = `出力フォーマット (キーのみ参考。値は本文から抽出した日本語で埋めること):
{"summary":"<本文を日本語で1〜2文要約>","entities":[{"type":"<上記の型>","name":"<本文中の表現>"}],"relations":[{"subject":{"type":"<entitiesに登録した型>","name":"<entitiesに登録した名前>"},"predicate":"<上記の述語>","object":{"type":"<entitiesに登録した型>","name":"<entitiesに登録した名前>"},"confidence":0.7}]}

JSON のみを返してください。出力フォーマット例の文字列 (react, ueda, Conventional Commits 等) を本文から抽出できない場合は使用禁止です:`;

function buildImproved(ep: Episode): string {
  const sys = [IMPROVED_SYS, /[?？]/.test(ep.raw_excerpt) ? IMPROVED_QGUIDE : IMPROVED_QSKIP, IMPROVED_OUT].join('\n\n');
  return `${sys}\n\n${ep.raw_excerpt}`;
}

// ── Schemas (same as memory-core) ─────────────────────────────────────────────
const EntitySchema = z.object({
  type: z.enum(['Person','Project','Package','File','Library','Tool','Concept','Decision','Bug','Task','Skill','Rule','Commit','Question']),
  name: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  attributes: z.record(z.string(), z.unknown()).optional().default({}),
});
const RelEnd = z.object({ type: z.string(), name: z.string() });
const RelationSchema = z.object({
  subject: RelEnd,
  predicate: z.enum(['prefers','dislikes','depends_on','replaces','relates_to','mentioned_in','authored_by','works_on','uses','fixes','affects','caused_by','introduced_by','asked_by','answered_in']),
  object: RelEnd,
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
  summary: z.string().nullable().optional().transform(v => v ?? ''),
  entities: z.array(EntitySchema.catch(null as unknown as z.infer<typeof EntitySchema>)).optional().default([])
    .transform(arr => arr.filter((x): x is z.infer<typeof EntitySchema> => x !== null)),
  relations: z.array(RelationSchema.catch(null as unknown as z.infer<typeof RelationSchema>)).optional().default([])
    .transform(arr => arr.filter((x): x is z.infer<typeof RelationSchema> => x !== null)),
  questions: z.array(QuestionSchema).optional().default([]),
});

// ── Quality metrics (raw response + parsed result) ─────────────────────────────
const HALLUCINATION_TOKENS = ['Conventional Commits', 'react', 'ueda'];
const JAPANESE_RE = /[぀-ゟ゠-ヿ一-鿿]/;

interface Metrics {
  raw_bytes: number;
  parse_ok: boolean;
  zod_ok: boolean;
  summary_lang_ja: boolean;
  summary_empty: boolean;
  entities: number;
  relations: number;
  questions: number;
  raw_entities_in_response: number;
  raw_relations_in_response: number;
  dup_relations: number;
  undef_in_rels: number;
  long_name_count: number; // entity.name > 80 chars
  caused_by_non_bug: number;
  rel_unregistered_endpoint: number;
  hallucination_tokens: number;
}

function analyzeResponse(text: string, parsed: z.infer<typeof ExtractionResultSchema> | null, originalExcerpt: string): Metrics {
  const m: Metrics = {
    raw_bytes: Buffer.byteLength(text, 'utf8'),
    parse_ok: false, zod_ok: parsed !== null,
    summary_lang_ja: false, summary_empty: false,
    entities: 0, relations: 0, questions: 0,
    raw_entities_in_response: 0, raw_relations_in_response: 0,
    dup_relations: 0, undef_in_rels: 0, long_name_count: 0,
    caused_by_non_bug: 0, rel_unregistered_endpoint: 0, hallucination_tokens: 0,
  };
  let raw: any = null;
  try { raw = JSON.parse(text); m.parse_ok = true; } catch { /* parse_ok=false */ }
  if (Array.isArray(raw?.entities)) m.raw_entities_in_response = raw.entities.length;
  if (Array.isArray(raw?.relations)) m.raw_relations_in_response = raw.relations.length;

  if (parsed) {
    m.entities = parsed.entities.length;
    m.relations = parsed.relations.length;
    m.questions = parsed.questions.length;
    m.summary_empty = parsed.summary.trim() === '';
    m.summary_lang_ja = parsed.summary.length > 0 && JAPANESE_RE.test(parsed.summary);
    const seen = new Set<string>();
    const entKeys = new Set<string>();
    for (const e of parsed.entities) {
      entKeys.add(`${e.type}:${e.name}`);
      if (e.name.length > 80) m.long_name_count++;
    }
    for (const r of parsed.relations) {
      const k = `${r.subject.type}:${r.subject.name}|${r.predicate}|${r.object.type}:${r.object.name}`;
      if (seen.has(k)) m.dup_relations++; else seen.add(k);
      if (r.subject.name === 'undefined' || r.object.name === 'undefined' ||
          r.subject.name === '' || r.object.name === '') m.undef_in_rels++;
      if (r.predicate === 'caused_by' && r.subject.type !== 'Bug') m.caused_by_non_bug++;
      const sk = `${r.subject.type}:${r.subject.name}`;
      const ok = `${r.object.type}:${r.object.name}`;
      if (!entKeys.has(sk) || !entKeys.has(ok)) m.rel_unregistered_endpoint++;
    }
    // Hallucination check: tokens from prompt example that don't appear in excerpt
    for (const tok of HALLUCINATION_TOKENS) {
      if (!originalExcerpt.includes(tok)) {
        const occurs = parsed.entities.some(e => e.name.includes(tok))
                    || parsed.relations.some(r => r.subject.name.includes(tok) || r.object.name.includes(tok));
        if (occurs) m.hallucination_tokens++;
      }
    }
  }
  return m;
}

// ── Ollama HTTP ──────────────────────────────────────────────────────────────
async function gen(baseUrl: string, model: string, prompt: string): Promise<string> {
  const r = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
  });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const d = (await r.json()) as { response?: string; thinking?: string };
  return (d.response || d.thinking || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// ── Episode sampling ─────────────────────────────────────────────────────────
async function loadEpisodes(trail: string, count: number): Promise<Episode[]> {
  const SQL = await initSqlJs();
  const data = readFileSync(trail);
  const db = new SQL.Database(data);
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const stmt = db.prepare(`SELECT m.uuid, m.session_id, m.type, m.timestamp,
       COALESCE(SUBSTR(m.text_content,1,2048), SUBSTR(m.user_content,1,2048),'') AS text_excerpt
     FROM messages m WHERE m.timestamp >= ? AND m.type IN ('user','assistant','system')
     ORDER BY m.session_id, m.timestamp`);
  stmt.bind([since]);
  const messages: Message[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const t = row['type'] as string;
    if (t !== 'user' && t !== 'assistant' && t !== 'system') continue;
    messages.push({ uuid: row['uuid'] as string, session_id: row['session_id'] as string, type: t,
                    timestamp: row['timestamp'] as string, text_excerpt: (row['text_excerpt'] as string) || '' });
  }
  stmt.free(); db.close();
  const all = splitEpisodes(messages);
  const meaningful = all.filter(e => Buffer.byteLength(e.raw_excerpt, 'utf8') >= 200);
  const step = Math.max(1, Math.floor(meaningful.length / count));
  const out: Episode[] = [];
  for (let i = 0; i < meaningful.length && out.length < count; i += step) out.push(meaningful[i]);
  return out;
}

// ── Run ──────────────────────────────────────────────────────────────────────
interface Row { variant: string; idx: number; bytes: number; latency_ms: number; metrics: Metrics; }

async function runVariant(name: string, builder: (e: Episode) => string, episodes: Episode[], baseUrl: string, model: string): Promise<Row[]> {
  const rows: Row[] = [];
  process.stderr.write(`\n=== Variant: ${name} ===\n`);
  process.stderr.write(`[${name}] warm-up...\n`);
  try { await gen(baseUrl, model, 'return {"ok":true} as JSON.'); } catch (e) { process.stderr.write(`warm err: ${(e as Error).message}\n`); }
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const t0 = Date.now();
    let text = '';
    let parsed: any = null;
    try {
      text = await gen(baseUrl, model, builder(ep));
      try { const p = JSON.parse(text); const v = ExtractionResultSchema.safeParse(p); if (v.success) parsed = v.data; } catch { /* parse fail */ }
    } catch (e) {
      process.stderr.write(`[${name}] ep ${i+1}/${episodes.length} HTTP err: ${(e as Error).message}\n`);
    }
    const lat = Date.now() - t0;
    const metrics = analyzeResponse(text, parsed, ep.raw_excerpt);
    process.stderr.write(
      `[${name}] ep ${i+1}/${episodes.length} (${Buffer.byteLength(ep.raw_excerpt,'utf8')}B) ${lat}ms ` +
      `raw[ent=${metrics.raw_entities_in_response} rel=${metrics.raw_relations_in_response}] ` +
      `parsed[ent=${metrics.entities} rel=${metrics.relations}] ` +
      `${metrics.summary_lang_ja ? 'JA' : '!JA'} dup=${metrics.dup_relations} undef=${metrics.undef_in_rels} ` +
      `cb!Bug=${metrics.caused_by_non_bug} unreg=${metrics.rel_unregistered_endpoint} long=${metrics.long_name_count} hall=${metrics.hallucination_tokens}\n`
    );
    rows.push({ variant: name, idx: i, bytes: Buffer.byteLength(ep.raw_excerpt,'utf8'), latency_ms: lat, metrics });
  }
  return rows;
}

function summarize(rows: Row[]): Record<string, number> {
  const n = rows.length;
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    n,
    latency_total_s: Math.round(sum(r => r.latency_ms) / 1000),
    latency_mean_ms: Math.round(sum(r => r.latency_ms) / n),
    entities_mean: +(sum(r => r.metrics.entities) / n).toFixed(2),
    relations_mean: +(sum(r => r.metrics.relations) / n).toFixed(2),
    summary_ja_rate: +(sum(r => r.metrics.summary_lang_ja ? 1 : 0) / n * 100).toFixed(0),
    summary_empty_rate: +(sum(r => r.metrics.summary_empty ? 1 : 0) / n * 100).toFixed(0),
    dup_relations_total: sum(r => r.metrics.dup_relations),
    undef_in_rels_total: sum(r => r.metrics.undef_in_rels),
    long_name_total: sum(r => r.metrics.long_name_count),
    caused_by_non_bug_total: sum(r => r.metrics.caused_by_non_bug),
    rel_unregistered_total: sum(r => r.metrics.rel_unregistered_endpoint),
    hallucination_total: sum(r => r.metrics.hallucination_tokens),
    raw_relations_total: sum(r => r.metrics.raw_relations_in_response),
    parsed_relations_total: sum(r => r.metrics.relations),
    silent_dropped_relations: sum(r => Math.max(0, r.metrics.raw_relations_in_response - r.metrics.relations)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
  process.stderr.write(`Loading episodes...\n`);
  const eps = await loadEpisodes(args.trailPath, args.episodes);
  process.stderr.write(`Sampled ${eps.length} episodes (model=${args.model})\n`);
  const base = await runVariant('baseline', buildBaseline, eps, baseUrl, args.model);
  const imp = await runVariant('improved', buildImproved, eps, baseUrl, args.model);
  const summary = { model: args.model, baseline: summarize(base), improved: summarize(imp) };
  process.stdout.write(JSON.stringify({ summary, rows: [...base, ...imp] }, null, 2));
  process.stdout.write('\n');
}
main().catch(e => { process.stderr.write(`fatal: ${e instanceof Error ? e.stack : String(e)}\n`); process.exit(1); });
