/**
 * grounding.cjs の具体化観点採掘（doctrineGap・DCT-14）のリグレッションテスト。
 *
 * 検査するのは「取りこぼしの数え方」そのもの。escalate の除外・破損申告の切り分け・
 * 列未マイグレーション時の測定不能表明は、どれも壊れても件数が減るだけで
 * 「シグナルが出ていない＝健全」に見えてしまい、既存テストでは検知できない。
 * 列定義は trail-activity の CREATE_DOCTRINE_JUDGMENTS と同期する。
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGroundingDoctrineGap(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-doctrine-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout).doctrineGap;
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

/**
 * grounding が参照する列のみ持つ最小 caravan-book.db を <ws>/.anytime/trail/db に作る。
 * activity.db は DB_DIR 解決（activity.db の存在で候補ディレクトリを確定する）のために空で置く。
 */
function writeCaravanDb(ws, { withColumn, judgments = [], instructions = [] }) {
  const dbDir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  new DatabaseSync(path.join(dbDir, 'activity.db')).close();
  const db = new DatabaseSync(path.join(dbDir, 'caravan-book.db'));
  db.exec(`CREATE TABLE caravan_doctrine_judgments (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    agent_judgment TEXT NOT NULL,
    coverage TEXT NOT NULL,
    human_decision TEXT,
    judged_at TEXT NOT NULL
    ${withColumn ? `, underspecified_points_json TEXT NOT NULL DEFAULT '[]'` : ''}
  )`);
  db.exec(`CREATE TABLE caravan_instructions (id TEXT PRIMARY KEY, summary TEXT, origin_prompt TEXT, started_at TEXT, closed_at TEXT)`);
  db.exec(`CREATE TABLE caravan_instruction_sessions (session_id TEXT PRIMARY KEY, instruction_id TEXT)`);
  judgments.forEach((j, i) => {
    const cols = ['id', 'session_id', 'subject', 'agent_judgment', 'coverage', 'human_decision', 'judged_at'];
    const vals = [i + 1, j.sessionId, j.subject ?? 'S', j.agentJudgment ?? 'approve', 'covered', j.humanDecision ?? null, j.judgedAt ?? '2026-08-08T00:00:00.000Z'];
    if (withColumn) {
      cols.push('underspecified_points_json');
      vals.push(j.points ?? '[]');
    }
    db.prepare(`INSERT INTO caravan_doctrine_judgments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  });
  for (const ins of instructions) {
    db.prepare(`INSERT INTO caravan_instructions VALUES (?,?,?,?,NULL)`).run(ins.id, ins.summary ?? '', ins.prompt, '2026-08-08T00:00:00.000Z');
    db.prepare(`INSERT INTO caravan_instruction_sessions VALUES (?,?)`).run(ins.sessionId, ins.id);
  }
  db.close();
}

describe('grounding doctrineGap (DCT-14)', () => {
  it('列が無い DB は 0 件でなく測定不能として出す', () => {
    const gap = runGroundingDoctrineGap((ws) =>
      writeCaravanDb(ws, { withColumn: false, judgments: [{ sessionId: 's1', humanDecision: 'modified' }] }),
    );
    expect(gap.available).toBe(false);
    expect(gap.reason).toContain('DCT-14');
    // 誤った 0 を真値にしない
    expect(gap.missedCount).toBeUndefined();
  });

  it('申告が空 + modified + 非 escalate だけを取りこぼしに数える', () => {
    const gap = runGroundingDoctrineGap((ws) =>
      writeCaravanDb(ws, {
        withColumn: true,
        judgments: [
          { sessionId: 'miss', humanDecision: 'modified', points: '[]' },
          // escalate は人へ返しているので取りこぼしではない
          { sessionId: 'esc', agentJudgment: 'escalate', humanDecision: 'modified', points: '[]' },
          // 申告できた側は「運用が働いた」記録
          { sessionId: 'declared', humanDecision: 'modified', points: '["未指定のケース"]' },
          // 一致は取りこぼしでない
          { sessionId: 'ok', humanDecision: 'approve', points: '[]' },
        ],
      }),
    );
    expect(gap.available).toBe(true);
    expect(gap.missedCount).toBe(1);
    expect(gap.declaredCount).toBe(1);
    expect(gap.missedSamples).toHaveLength(1);
  });

  it('破損した申告は空にも非空にも倒さず別カウントする', () => {
    const gap = runGroundingDoctrineGap((ws) =>
      writeCaravanDb(ws, {
        withColumn: true,
        judgments: [
          { sessionId: 'broken', humanDecision: 'modified', points: '"not-an-array"' },
          { sessionId: 'ok', humanDecision: 'approve', points: '[]' },
        ],
      }),
    );
    expect(gap.unreadableDeclarations).toBe(1);
    // 破損を空扱いにすると取りこぼしが 1 に膨らみ、非空扱いにすると申告率が上がる
    expect(gap.missedCount).toBe(0);
    expect(gap.declaredCount).toBe(0);
  });

  it('指示の型を origin_prompt から決定論で分類する（昇格判定の突合キー）', () => {
    const gap = runGroundingDoctrineGap((ws) =>
      writeCaravanDb(ws, {
        withColumn: true,
        judgments: [
          { sessionId: 's1', humanDecision: 'modified', points: '[]' },
          { sessionId: 's2', humanDecision: 'modified', points: '[]' },
          { sessionId: 's3', humanDecision: 'modified', points: '[]' },
          { sessionId: 's4', humanDecision: 'modified', points: '[]' },
        ],
        instructions: [
          { id: 'i1', sessionId: 's1', prompt: '次をすすめて' },
          { id: 'i2', sessionId: 's2', prompt: 'Reviews タブで表示している記録が登録される条件は？' },
          { id: 'i3', sessionId: 's3', prompt: 'タブの上にワークスペースを選択できるドロップダウンメニューを追加してください' },
          // s4 は指示台帳へ未紐付け
        ],
      }),
    );
    expect(gap.missedByPromptShape).toEqual({ terse: 1, question: 1, other: 1, undeclared: 1 });
  });

  it('DCT-14 導入日より前の判断は分母に入れない（バックフィルの空申告で率が薄まらない）', () => {
    const gap = runGroundingDoctrineGap((ws) =>
      writeCaravanDb(ws, {
        withColumn: true,
        judgments: [
          { sessionId: 'old', humanDecision: 'modified', points: '[]', judgedAt: '2026-08-01T00:00:00.000Z' },
          { sessionId: 'new', humanDecision: 'modified', points: '[]', judgedAt: '2026-08-08T00:00:00.000Z' },
        ],
      }),
    );
    expect(gap.total).toBe(1);
    expect(gap.missedCount).toBe(1);
  });
});
