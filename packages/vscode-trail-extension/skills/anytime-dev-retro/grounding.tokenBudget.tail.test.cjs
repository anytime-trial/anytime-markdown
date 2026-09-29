/**
 * grounding.token-budget.cjs の tail(30 日窓・モデル別コスト断片の尾)集計の統合テスト。
 * tailStats の純粋関数テスト(costTail.test.cjs)が担わない 3 点を固定する:
 * 窓境界の SQL(start_time の ISO 書式比較)・(model, session) 単位の GROUP BY・出力キーと並び順。
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runTokenBudget(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-token-budget-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.token-budget.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

// grounding.token-budget.cjs が参照する列のみ定義する(他クエリの列不足は q() が errors に記録して続行する)。
// start_time は SQLite の datetime 式で生成し、本体の strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days') と
// 同じ ISO(...Z) 書式に揃える(文字列比較のずれを再現するため、プリペアド文字列にしない)。
function writeTrailDb(ws, { sessions, costs }) {
  const dbDir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new DatabaseSync(path.join(dbDir, 'activity.db'));
  db.exec(`CREATE TABLE activity_sessions (id TEXT PRIMARY KEY, start_time TEXT, message_count INTEGER, peak_context_tokens INTEGER, compact_count INTEGER, sub_agent_count INTEGER, git_branch TEXT, model TEXT);
    CREATE TABLE activity_session_costs (session_id TEXT, model TEXT, estimated_cost_usd REAL, cache_read_tokens INTEGER, output_tokens INTEGER);`);
  for (const s of sessions) {
    db.prepare("INSERT INTO activity_sessions (id, start_time) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?))").run(s.id, s.mod);
  }
  for (const c of costs) {
    db.prepare('INSERT INTO activity_session_costs VALUES (?,?,?,0,0)').run(c.session_id, c.model, c.cost);
  }
  db.close();
}

describe('grounding.token-budget.cjs tail 集計', () => {
  test('30 日窓内の (model, session) 断片だけを集計し、キーと sessions 降順を守る', () => {
    const snap = runTokenBudget((ws) => writeTrailDb(ws, {
      sessions: [
        { id: 's-in-1', mod: '-1 days' },
        { id: 's-in-2', mod: '-10 days' },
        { id: 's-in-3', mod: '-29 days' },
        { id: 's-out-old', mod: '-40 days' },
        { id: 's-out-future', mod: '+1 days' },
      ],
      costs: [
        // s-in-1 は 2 モデル使用: セッション総額でなくモデル別断片へ割れる
        { session_id: 's-in-1', model: 'opus', cost: 30 },
        { session_id: 's-in-1', model: 'sonnet', cost: 2 },
        { session_id: 's-in-2', model: 'opus', cost: 10 },
        { session_id: 's-in-3', model: 'opus', cost: 50 },
        // 同一 (model, session) の複数行は SUM される
        { session_id: 's-in-3', model: 'opus', cost: 10 },
        // 窓外は除外
        { session_id: 's-out-old', model: 'opus', cost: 999 },
        { session_id: 's-out-future', model: 'haiku', cost: 999 },
      ],
    }));
    expect(snap.tail.windowDays).toBe(30);
    expect(snap.tail.byModel.map((r) => r.model)).toEqual(['opus', 'sonnet']);
    const opus = snap.tail.byModel[0];
    expect(Object.keys(opus).sort()).toEqual(
      ['maxCost', 'medianCost', 'model', 'p90Cost', 'sessions', 'top10PctShareCost'].sort(),
    );
    // opus の断片: [30, 10, 60] → 中央値 30・p90 60・最大 60・上位 ceil(3/10)=1 件 60/100
    expect(opus).toEqual({ model: 'opus', sessions: 3, medianCost: 30, p90Cost: 60, top10PctShareCost: 60, maxCost: 60 });
    expect(snap.tail.byModel[1]).toEqual({ model: 'sonnet', sessions: 1, medianCost: 2, p90Cost: 2, top10PctShareCost: 100, maxCost: 2 });
  });

  test('DB 不在は errors に理由を残し tail は空の byModel を返す', () => {
    const snap = runTokenBudget(() => {});
    expect(snap.errors.some((e) => /open failed/.test(e))).toBe(true);
    expect(snap.tail).toEqual({ windowDays: 30, byModel: [] });
  });
});
