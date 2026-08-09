/**
 * 検索評価ハーネス（spec memory-core §7.8・proposal 20260809 A0）。
 *
 * golden task（eval/golden-tasks.json）を取得 API へ流し、
 * 単一指標「回収事実数 / 1,000 トークン」（副指標 hit@5・MRR）を実測する。
 * トークン概算は応答 JSON 文字数 / 3（§7.7 と同一定義）。
 *
 * 本番 DB の**コピー**に対して実行する。DB パスは必須引数
 * （暗黙の cwd フォールバックは CI で空 DB を掴む既知の罠のため禁止）。
 *
 * 使い方:
 *   npx tsx scripts/run-retrieval-eval.mts \
 *     <caravan-book.db のコピー> [activity.db のコピー]
 *
 * ollama（bge-m3）は OLLAMA_BASE_URL（既定 http://localhost:11434）。
 * 不通の場合、検索タスクは BM25 のみへ縮退した状態を計測する（縮退も実測対象）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCaravanBookDb } from '../src/db/connection';
import { attachTrailDbReadOnly } from '../src/db/attach';
import { hybridSearchCaravanBook } from '../src/rag/hybridSearchCaravanBook';
import { shapeSearchResponse } from '../src/retrieve/shapeSearchResponse';
import { getBugCausality } from '../src/retrieve/getBugCausality';
import { getPlanContext } from '../src/retrieve/getPlanContext';

interface GoldenTask {
  id: string;
  kind: 'search' | 'bug_causality' | 'plan_context';
  input: Record<string, unknown>;
  expected_facts: string[];
}

interface TaskResult {
  id: string;
  kind: GoldenTask['kind'];
  tokens: number;
  facts_expected: number;
  facts_recovered: number;
  first_hit_rank: number | null;
}

const [caravanDbPath, activityDbPath] = process.argv.slice(2);
if (!caravanDbPath) {
  console.error('Usage: run-retrieval-eval.mts <caravan-book.db copy> [activity.db copy]');
  process.exit(1);
}
if (!fs.existsSync(caravanDbPath)) {
  console.error(`not found: ${caravanDbPath}`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tasksPath = path.join(scriptDir, '..', 'eval', 'golden-tasks.json');
const tasks: GoldenTask[] = (JSON.parse(fs.readFileSync(tasksPath, 'utf8')) as { tasks: GoldenTask[] }).tasks;

const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
const ollama = {
  async embeddings(req: { model: string; prompt: string }): Promise<{ embedding: number[] }> {
    const res = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`ollama embeddings failed: ${res.status}`);
    return (await res.json()) as { embedding: number[] };
  },
};

function estimateTokens(json: string): number {
  return Math.ceil(json.length / 3);
}

const { db, close } = await openCaravanBookDb(caravanDbPath);
try {
  if (activityDbPath) {
    if (!fs.existsSync(activityDbPath)) {
      console.error(`not found: ${activityDbPath}`);
      process.exit(1);
    }
    await attachTrailDbReadOnly(db, activityDbPath);
  } else {
    console.warn('[eval] activity.db 未指定: plan_context の共変更セクションは縮退計測になる');
  }

  const results: TaskResult[] = [];
  for (const task of tasks) {
    let responseJson = '';
    let firstHitRank: number | null = null;
    try {
      if (task.kind === 'search') {
        const raw = await hybridSearchCaravanBook({
          db,
          ollama: ollama as never,
          input: { query: String(task.input['query'] ?? ''), ...task.input },
        });
        const shaped = shapeSearchResponse(raw, 'compact');
        responseJson = JSON.stringify(shaped);
        for (let i = 0; i < shaped.entities.length; i++) {
          const entityJson = JSON.stringify(shaped.entities[i]);
          if (task.expected_facts.some((f) => entityJson.includes(f))) {
            firstHitRank = i + 1;
            break;
          }
        }
      } else if (task.kind === 'bug_causality') {
        responseJson = JSON.stringify(getBugCausality(db, task.input));
      } else {
        responseJson = JSON.stringify(
          getPlanContext(db, {
            target_paths: (task.input['target_paths'] as string[]) ?? [],
            token_budget: task.input['token_budget'] as number | undefined,
          }),
        );
      }
    } catch (err) {
      console.error(`[eval] task ${task.id} failed: ${err instanceof Error ? (err.stack ?? '') : String(err)}`);
      responseJson = JSON.stringify({ error: String(err) });
    }

    results.push({
      id: task.id,
      kind: task.kind,
      tokens: estimateTokens(responseJson),
      facts_expected: task.expected_facts.length,
      facts_recovered: task.expected_facts.filter((f) => responseJson.includes(f)).length,
      first_hit_rank: firstHitRank,
    });
  }

  const byKind = new Map<string, TaskResult[]>();
  for (const r of results) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const aggregate = (rs: TaskResult[]) => {
    const tokens = rs.reduce((a, r) => a + r.tokens, 0);
    const recovered = rs.reduce((a, r) => a + r.facts_recovered, 0);
    const expected = rs.reduce((a, r) => a + r.facts_expected, 0);
    const searchTasks = rs.filter((r) => r.kind === 'search');
    return {
      tasks: rs.length,
      facts_recovered: recovered,
      facts_expected: expected,
      tokens_total: tokens,
      facts_per_1k_tokens: tokens > 0 ? Number(((recovered / tokens) * 1000).toFixed(2)) : 0,
      ...(searchTasks.length > 0
        ? {
            hit_at_5: searchTasks.filter((r) => r.first_hit_rank !== null && r.first_hit_rank <= 5).length / searchTasks.length,
            mrr: Number(
              (searchTasks.reduce((a, r) => a + (r.first_hit_rank ? 1 / r.first_hit_rank : 0), 0) / searchTasks.length).toFixed(3),
            ),
          }
        : {}),
    };
  };

  const report = {
    measured_at: new Date().toISOString(),
    caravan_db: caravanDbPath,
    activity_db: activityDbPath ?? null,
    per_task: results,
    per_kind: Object.fromEntries([...byKind.entries()].map(([k, rs]) => [k, aggregate(rs)])),
    overall: aggregate(results),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  close();
}
