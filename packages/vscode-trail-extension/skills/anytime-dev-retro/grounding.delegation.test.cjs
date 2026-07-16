/**
 * grounding.cjs の委任成績集計（delegation ブロック）のリグレッションテスト。
 *
 * 由来: 正規表現末尾の \b は JS では \w=[A-Za-z0-9_] 基準のため日本語直後に成立せず、
 * 「採用」「差し戻し」が永久に不一致になるバグをマージ前レビューが検出した(2026-07-16)。
 * 書式契約は anytime-dev-cycle references/delegation.md §2.2 と同期する。
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGroundingRaw(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-delegation-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
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

function runGrounding(setup) {
  return runGroundingRaw(setup).delegation;
}

// modelBehavior 検証用の最小 trail.db を <ws>/.anytime/trail/db に作る。
// grounding が参照する列のみ定義する(他クエリはテーブル不在でエラーになるが q() が握って続行する)。
function writeTrailDb(ws, { sessions, messages, toolCalls }) {
  const dbDir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new DatabaseSync(path.join(dbDir, 'trail.db'));
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, start_time TEXT);
    CREATE TABLE messages (session_id TEXT, type TEXT, model TEXT, agent_model TEXT, output_tokens INTEGER);
    CREATE TABLE message_tool_calls (session_id TEXT, model TEXT, is_error INTEGER, has_thinking INTEGER, turn_exec_ms INTEGER);`);
  // start_time は SQLite の datetime 式で評価させる(プリペアド値だと文字列リテラルになり
  // grounding 側の datetime('now','-30 days') との比較が壊れる)。mod は '0 days'/'-40 days' 等。
  for (const s of sessions) {
    db.prepare("INSERT INTO sessions VALUES (?, datetime('now', ?))").run(s.id, s.mod);
  }
  for (const m of messages) {
    db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(
      m.session_id, m.type, m.model, m.agent_model ?? null, m.output_tokens,
    );
  }
  for (const t of toolCalls) {
    db.prepare('INSERT INTO message_tool_calls VALUES (?,?,?,?,?)').run(
      t.session_id, t.model, t.is_error, 0, t.turn_exec_ms,
    );
  }
  db.close();
}

function writeDocs(ws, planLines) {
  const docs = path.join(ws, 'docs');
  fs.mkdirSync(path.join(docs, 'plan'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.anytime', 'trail'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, '.anytime', 'trail', 'lep.json'),
    JSON.stringify({ sources: { docs: { root: docs } } }),
  );
  fs.writeFileSync(path.join(docs, 'plan', 'p.md'), planLines.join('\n'));
}

describe('grounding.cjs delegation 集計', () => {
  test('採用/差し戻し/abstain を版数別に数える（日本語直後の境界で取りこぼさない）', () => {
    const delegation = runGrounding((ws) =>
      writeDocs(ws, [
        '- 委譲結果: 雛形v2 採用 — 所感',
        '- 委譲結果: 雛形v2 差し戻し — 乖離内容',
        '- 委譲結果: 雛形v2 採用',
        '- 委譲結果: 雛形v3 abstain — 前提不整合',
        '- 委譲結果: 雛形v2 採用形 これは誤マッチさせない',
        '  - 委譲結果: 雛形v2 採用 — 行頭固定なのでネストは数えない',
      ]),
    );
    expect(delegation.recorded).toBe(4);
    expect(delegation.byVersion.v2).toEqual({ 採用: 2, 差し戻し: 1, abstain: 0 });
    expect(delegation.byVersion.v3).toEqual({ 採用: 0, 差し戻し: 0, abstain: 1 });
  });

  test('モデルタグ [model] を版数別とモデル別の双方に数える（後方互換）', () => {
    const delegation = runGrounding((ws) =>
      writeDocs(ws, [
        '- 委譲結果: 雛形v2 [codex] 採用 — 所感',
        '- 委譲結果: 雛形v2 [codex] 差し戻し — 乖離',
        '- 委譲結果: 雛形v2 [qwen3:8b] 採用 — 所感',
        '- 委譲結果: 雛形v2 採用 — モデルタグなし旧書式',
        '- 委譲結果: 雛形v2 [codex] 採用形 これは誤マッチさせない',
      ]),
    );
    // 版数別は従来どおり（タグ有無に依らず数える）
    expect(delegation.byVersion.v2).toEqual({ 採用: 3, 差し戻し: 1, abstain: 0 });
    // モデル別: タグ付きはモデル名で、タグなしは (unspecified) で集計
    expect(delegation.byModel.codex).toEqual({ 採用: 1, 差し戻し: 1, abstain: 0 });
    expect(delegation.byModel['qwen3:8b']).toEqual({ 採用: 1, 差し戻し: 0, abstain: 0 });
    expect(delegation.byModel['(unspecified)']).toEqual({ 採用: 1, 差し戻し: 0, abstain: 0 });
  });

  test('docs root 未解決は測定不能 null（0 件と区別する）', () => {
    const delegation = runGrounding(() => {
      /* lep.json なし */
    });
    expect(delegation.recorded).toBeNull();
    expect(delegation.byVersion).toBeNull();
    expect(delegation.byModel).toBeNull();
  });
});

describe('grounding.cjs modelBehavior 集計', () => {
  function byModelOf(setup) {
    const mb = runGroundingRaw(setup).modelBehavior;
    const map = {};
    for (const e of mb.byModel) map[e.model] = e;
    return { mb, map };
  }

  test('冗長性(model キー)とツール挙動を突合し、除外・窓境界・tool のみ分離を守る', () => {
    const { mb, map } = byModelOf((ws) =>
      writeTrailDb(ws, {
        sessions: [
          { id: 's_in', mod: '0 days' },
          { id: 's_out', mod: '-40 days' },
        ],
        messages: [
          { session_id: 's_in', type: 'assistant', model: 'claude-opus-4-8', output_tokens: 1000 },
          { session_id: 's_in', type: 'assistant', model: 'claude-opus-4-8', output_tokens: 500 },
          { session_id: 's_in', type: 'assistant', model: 'claude-haiku-4-5', output_tokens: 100 },
          { session_id: 's_in', type: 'assistant', model: '', output_tokens: 999 }, // 空 model 除外
          { session_id: 's_in', type: 'user', model: 'claude-opus-4-8', output_tokens: 0 }, // 非 assistant 除外
          { session_id: 's_out', type: 'assistant', model: 'claude-opus-4-8', output_tokens: 9999 }, // 窓外除外
        ],
        toolCalls: [
          { session_id: 's_in', model: 'claude-opus-4-8', is_error: 0, turn_exec_ms: 100 },
          { session_id: 's_in', model: 'claude-opus-4-8', is_error: 1, turn_exec_ms: 300 },
          { session_id: 's_in', model: 'claude-sonnet-5', is_error: 0, turn_exec_ms: 50 }, // tool のみ
          { session_id: 's_out', model: 'claude-opus-4-8', is_error: 1, turn_exec_ms: 999 }, // 窓外除外
        ],
      }),
    );

    expect(mb.windowDays).toBe(30);
    expect(mb.minSampleForJudgment).toBe(5);

    expect(map['claude-opus-4-8']).toEqual({
      model: 'claude-opus-4-8',
      assistantMsgs: 2,
      avgOutputTokens: 750,
      toolCalls: 2,
      toolErrorRatePct: 50,
      avgTurnExecMs: 200,
    });
    // tool 呼び出しの無いモデルは tool 指標が null
    expect(map['claude-haiku-4-5']).toMatchObject({
      assistantMsgs: 1,
      avgOutputTokens: 100,
      toolCalls: null,
      toolErrorRatePct: null,
      avgTurnExecMs: null,
    });
    // assistant メッセージの無いモデル(tool のみ)は verbosity 指標が null で分離される
    expect(map['claude-sonnet-5']).toMatchObject({
      assistantMsgs: null,
      avgOutputTokens: null,
      toolCalls: 1,
      toolErrorRatePct: 0,
      avgTurnExecMs: 50,
    });
    // 空 model は byModel に現れない
    expect(map['']).toBeUndefined();
  });
});
