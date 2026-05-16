/**
 * Re-run extraction on specific episode indices and dump entities/relations
 * for both 7b and 3b. Uses the same deterministic sampling as evaluate-model-quality.mts.
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const MAX_EXCERPT_BYTES = 2048;
interface Message { uuid: string; session_id: string; type: 'user'|'assistant'|'system'; timestamp: string; text_excerpt: string; }
interface Episode { session_id: string; message_uuid_start: string; message_uuid_end: string; valid_from: string; raw_excerpt: string; }

function truncateToBytes(str: string, max: number): string {
  const b = Buffer.from(str, 'utf8');
  return b.byteLength <= max ? str : b.subarray(0, max).toString('utf8').replace(/�$/, '');
}
function splitEpisodes(messages: Message[]): Episode[] {
  const episodes: Episode[] = [];
  const sm = new Map<string, Message[]>();
  for (const m of messages) {
    const k = m.session_id; if (!sm.has(k)) sm.set(k, []); sm.get(k)!.push(m);
  }
  for (const [sid, ms] of sm) {
    const f = ms.findIndex(m => m.type === 'user'); if (f === -1) continue;
    let bs = f;
    for (let i = f + 1; i <= ms.length; i++) {
      if (i === ms.length || ms[i].type === 'user') {
        const bm = ms.slice(bs, i);
        episodes.push({
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
  return episodes;
}

const SYS = `あなたは Claude Code / Codex のセッションログから事実を抽出するアナリストです。
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
const QSKIP = `Question entity は抽出しません。`;
const QGUIDE = `ブロック内のユーザーメッセージに疑問符が 1 つ以上含まれており、かつ
仕様 / 設計 / 実装の確認意図がある場合は Question entity を抽出してください。`;
const OUT = `出力例 (summary は必須):
{"summary":"...","entities":[{"type":"Library","name":"react"}],"relations":[{"subject":{"type":"Person","name":"ueda"},"predicate":"prefers","object":{"type":"Concept","name":"Conventional Commits"},"confidence":0.9}]}
JSON のみを返してください:`;

function buildPrompt(ep: Episode): string {
  const sys = [SYS, /[?？]/.test(ep.raw_excerpt) ? QGUIDE : QSKIP, OUT].join('\n\n');
  return `${sys}\n\n${ep.raw_excerpt}`;
}

async function generate(baseUrl: string, model: string, prompt: string): Promise<string> {
  const r = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
  });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const d = (await r.json()) as { response?: string; thinking?: string };
  return (d.response || d.thinking || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function loadEpisodes(trail: string, count: number): Promise<(Episode & { excerpt_bytes: number })[]> {
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
                    timestamp: row['timestamp'] as string, text_excerpt: (row['text_excerpt'] as string)|| '' });
  }
  stmt.free(); db.close();
  const all = splitEpisodes(messages);
  const m = all.filter(e => Buffer.byteLength(e.raw_excerpt, 'utf8') >= 200);
  const step = Math.max(1, Math.floor(m.length / count));
  const out: (Episode & { excerpt_bytes: number })[] = [];
  for (let i = 0; i < m.length && out.length < count; i += step) {
    out.push({ ...m[i], excerpt_bytes: Buffer.byteLength(m[i].raw_excerpt, 'utf8') });
  }
  return out;
}

async function main() {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
  const targetIdx = (process.argv[2] ?? '0,5,7,19').split(',').map(Number);
  const eps = await loadEpisodes(`${homedir()}/.claude/trail/trail.db`, 20);

  for (const idx of targetIdx) {
    const ep = eps[idx];
    if (!ep) { console.log(`\n## idx ${idx}: not found`); continue; }
    console.log(`\n## idx ${idx} (${ep.excerpt_bytes}B, session ${ep.session_id.slice(0,8)})`);
    console.log('### raw_excerpt (head 600 chars)');
    console.log('```');
    console.log(ep.raw_excerpt.slice(0, 600).replace(/\n/g, ' ⏎ '));
    console.log('```');

    for (const model of ['qwen2.5:7b', 'qwen2.5:3b']) {
      process.stderr.write(`[${model}] idx ${idx}...\n`);
      const t0 = Date.now();
      try {
        const text = await generate(baseUrl, model, buildPrompt(ep));
        const parsed = JSON.parse(text);
        console.log(`\n### ${model} (${Date.now()-t0}ms)`);
        console.log('summary:', parsed.summary ?? '(none)');
        console.log('entities:');
        for (const e of (parsed.entities ?? [])) console.log(`  - ${e.type}: ${e.name}`);
        console.log('relations:');
        for (const r of (parsed.relations ?? []))
          console.log(`  - ${r.subject?.type}:${r.subject?.name} --[${r.predicate}]--> ${r.object?.type}:${r.object?.name}`);
        if (parsed.questions?.length) {
          console.log('questions:');
          for (const q of parsed.questions) console.log(`  - ${q.text}`);
        }
      } catch (e) {
        console.log(`\n### ${model} (ERROR)`); console.log((e as Error).message);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
