
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

// 仕様: getCombinedData は sessions.start_time が空文字だと
// DATE(s.start_time, tz) が NULL になり cutoff 比較で除外される。
// テスト fixture も valid な ISO 8601 timestamp を使う必要がある。
// また getCombinedData は DATE('now','-30 days') で、getAnalytics は -180 days で
// cutoff するため、固定日付だと実行日が進むとデータが窓外になり落ちる。
// 実行日基準の最近日（3 日前 UTC）を使い日付非依存にする。
const DAY = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const SESSION_START = `${DAY}T09:00:00.000Z`;
const MESSAGE_TS = `${DAY}T10:00:00.000Z`;

const insertSession = (db: TrailDatabase, sessionId: string, source: string): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES (?, ?, '0', '', '', ?, ?, 0, '', 0, ?, ?)`,
    [sessionId, sessionId, SESSION_START, SESSION_START, SESSION_START, source],
  );
};

const insertAssistantMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  timestamp = MESSAGE_TS,
): void => {
  inner(db).run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, type, model, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, timestamp
     ) VALUES (?, ?, 'assistant', ?, ?, ?, 0, 0, ?)`,
    [uuid, sessionId, model, inputTokens, outputTokens, timestamp],
  );
};

describe('TrailDatabase.getCombinedData - token missing rate compensation', () => {
  let db: TrailDatabase;

  beforeAll(async () => {
    db = await createTestTrailDatabase();
  });

  describe('modelStats', () => {
    beforeAll(() => {
      // Codex session: 10 assistant messages, 4 with tokens=0 (missing)
      insertSession(db, 'session-codex-1', 'codex');
      const codexModel = 'gpt-5.4-codex';
      for (let i = 0; i < 6; i++) {
        // observed turns: input=100, output=100
        insertAssistantMessage(db, `msg-codex-observed-${i}`, 'session-codex-1', codexModel, 100, 100);
      }
      for (let i = 0; i < 4; i++) {
        // missing turns: tokens=0
        insertAssistantMessage(db, `msg-codex-missing-${i}`, 'session-codex-1', codexModel, 0, 0);
      }

      // Claude Code session: 5 assistant messages, none missing (different model)
      insertSession(db, 'session-cc-1', 'claude_code');
      const ccModel = 'claude-sonnet-4-6';
      for (let i = 0; i < 5; i++) {
        insertAssistantMessage(db, `msg-cc-${i}`, 'session-cc-1', ccModel, 200, 200);
      }
    });

    it('applies factor to Codex modelStats tokens', () => {
      const data = db.getCombinedData('day', 30);
      const codexModel = data.modelStats.find(
        r => r.tokenMissingTurns > 0,
      );
      expect(codexModel).toBeDefined();
      expect(codexModel!.tokenMissingRate).toBeCloseTo(0.4);
      expect(codexModel!.tokenTotalTurns).toBe(10);
      expect(codexModel!.tokenMissingTurns).toBe(4);

      // raw tokens = 6 * (100 + 100) = 1200
      // factor = 10 / 6 ≈ 1.667
      // adjusted = round(1200 * 10/6) = round(2000) = 2000
      const rawTokens = 6 * 200;
      const factor = 10 / 6;
      expect(codexModel!.tokens).toBe(Math.round(rawTokens * factor));
    });

    it('has factor=1 (no compensation) for Claude Code modelStats', () => {
      const data = db.getCombinedData('day', 30);
      const ccModel = data.modelStats.find(
        r => r.tokenMissingTurns === 0 && r.tokenTotalTurns > 0,
      );
      expect(ccModel).toBeDefined();
      expect(ccModel!.tokenMissingRate).toBe(0);
      // raw tokens = 5 * 400 = 2000, factor = 1
      expect(ccModel!.tokens).toBe(5 * 400);
    });

    it('includes tokenMissingRate, tokenTotalTurns, tokenMissingTurns on all rows', () => {
      const data = db.getCombinedData('day', 30);
      for (const row of data.modelStats) {
        expect(typeof row.tokenMissingRate).toBe('number');
        expect(typeof row.tokenTotalTurns).toBe('number');
        expect(typeof row.tokenMissingTurns).toBe('number');
      }
    });
  });

  describe('toolCounts', () => {
    beforeAll(() => {
      // Codex session: 5 Bash tool calls, 3 observed turns + 2 missing turns
      insertSession(db, 'session-tool-1', 'codex');
      // 3 observed assistant messages (input=100, output=50)
      for (let i = 0; i < 3; i++) {
        insertAssistantMessage(db, `msg-tool-obs-${i}`, 'session-tool-1', 'gpt-5.4-codex', 100, 50);
        inner(db).run(
          `INSERT OR IGNORE INTO message_tool_calls (
             session_id, message_uuid, turn_index, call_index, tool_name, timestamp
           ) VALUES (?, ?, ?, 0, 'Bash', '${MESSAGE_TS}')`,
          ['session-tool-1', `msg-tool-obs-${i}`, i],
        );
      }
      // 2 missing assistant messages (all tokens=0)
      for (let i = 3; i < 5; i++) {
        inner(db).run(
          `INSERT OR IGNORE INTO messages (
             uuid, session_id, type, model, input_tokens, output_tokens,
             cache_read_tokens, cache_creation_tokens, timestamp
           ) VALUES (?, ?, 'assistant', 'gpt-5.4-codex', 0, 0, 0, 0, '${MESSAGE_TS}')`,
          [`msg-tool-miss-${i}`, 'session-tool-1'],
        );
        inner(db).run(
          `INSERT OR IGNORE INTO message_tool_calls (
             session_id, message_uuid, turn_index, call_index, tool_name, timestamp
           ) VALUES (?, ?, ?, 0, 'Bash', '${MESSAGE_TS}')`,
          ['session-tool-1', `msg-tool-miss-${i}`, i],
        );
      }
    });

    it('applies factor to Bash toolCounts tokens', () => {
      const data = db.getCombinedData('day', 30);
      const bashRow = data.toolCounts.find(r => r.tool === 'Bash' && r.count >= 5);
      expect(bashRow).toBeDefined();
      // rawTokens per tool call = (100+50) / 1 = 150 for each observed turn
      // total raw = 3 * 150 = 450
      // factor = 5 / 3
      // adjusted = round(450 * 5/3) = round(750) = 750
      expect(bashRow!.tokens).toBe(Math.round(3 * 150 * (5 / 3)));
    });

    it('returns tokenMissingRate ≈ 0.4 for Bash', () => {
      const data = db.getCombinedData('day', 30);
      const bashRow = data.toolCounts.find(r => r.tool === 'Bash' && r.count >= 5);
      expect(bashRow).toBeDefined();
      expect(bashRow!.tokenMissingRate).toBeCloseTo(0.4);
    });

    it('includes tokenMissingRate on all toolCounts rows', () => {
      const data = db.getCombinedData('day', 30);
      for (const row of data.toolCounts) {
        expect(typeof row.tokenMissingRate).toBe('number');
      }
    });
  });

  describe('getAnalytics - totals & dailyActivity', () => {
    it('applies factor to totals inputTokens and outputTokens', () => {
      const analytics = db.getAnalytics();
      // All test data combined:
      // codex source: session-codex-1 (10 turns, 4 missing) + session-tool-1 (5 turns, 2 missing)
      //   total_turns=15, missing=6, factor=15/9=5/3
      //   raw_input = 6*100 + 3*100 = 900, raw_output = 6*100 + 3*50 = 750
      //   adjusted_input = round(900*5/3)=1500, adjusted_output = round(750*5/3)=1250
      // claude_code source: session-cc-1 (5 turns, 0 missing), factor=1
      //   raw_input=5*200=1000, raw_output=5*200=1000
      expect(analytics.totals.inputTokens).toBe(2500);
      expect(analytics.totals.outputTokens).toBe(2250);
      expect(analytics.totals.cacheReadTokens).toBe(0);
      expect(analytics.totals.cacheCreationTokens).toBe(0);
    });

    it('totals token sum matches sum of agentStats.tokens from getCombinedData', () => {
      const analytics = db.getAnalytics();
      const combined = db.getCombinedData('day', 30);
      const agentSum = combined.agentStats.reduce((s, r) => s + r.tokens, 0);
      const totalsSum = analytics.totals.inputTokens + analytics.totals.outputTokens
        + analytics.totals.cacheReadTokens + analytics.totals.cacheCreationTokens;
      expect(Math.abs(agentSum - totalsSum)).toBeLessThanOrEqual(4);
    });

    it('dailyActivity rows have factor-adjusted tokens', () => {
      const analytics = db.getAnalytics();
      const testDate = DAY;
      const dayEntry = analytics.dailyActivity.find(d => d.date === testDate);
      expect(dayEntry).toBeDefined();
      // Same expected values as totals (all test data is on DAY)
      expect(dayEntry!.inputTokens).toBe(2500);
      expect(dayEntry!.outputTokens).toBe(2250);
    });
  });

  describe('getSessionTokens & getDailyTokensToday', () => {
    it('getSessionTokens applies factor for Codex session', () => {
      // session-codex-1: 10 turns, 4 missing, 6 observed turns with input=100, output=100
      // raw = 6*(100+100) = 1200, factor = 10/6
      // adjusted = round(1200 * 10/6) = round(2000) = 2000
      const tokens = db.getSessionTokens('session-codex-1');
      expect(tokens).toBe(Math.round(6 * 200 * (10 / 6)));
    });

    it('getSessionTokens returns raw sum for Claude Code session (factor=1)', () => {
      // session-cc-1: 5 turns, 0 missing
      // raw = 5*(200+200) = 2000, factor=1
      const tokens = db.getSessionTokens('session-cc-1');
      expect(tokens).toBe(5 * 400);
    });
  });

});

// ---------------------------------------------------------------------------
// Task 7: 統合シナリオ（独立 DB インスタンス）
// Claude 5 sessions (100 turns, 0 missing) + Codex 3 sessions (60 turns, 24 missing)
// ---------------------------------------------------------------------------
describe('TrailDatabase integration scenario - mixed Claude + Codex', () => {
  let db2: TrailDatabase;

  // fixture constants
  const CC_SESSIONS = 5;
  const CC_TURNS_PER = 20;
  const CC_INPUT = 10;
  const CC_OUTPUT = 10;
  const CX_SESSIONS = 3;
  const CX_TURNS_PER = 20;
  const CX_OBSERVED = 12; // per session
  const CX_MISSING = 8;   // per session  (total missing = 24)
  const CX_INPUT = 5;
  const CX_OUTPUT = 5;
  const CC_MODEL = 'claude-sonnet-int';
  const CX_MODEL = 'gpt-codex-int';

  beforeAll(async () => {
    db2 = await createTestTrailDatabase();
    const db2inner = inner(db2);

    // Claude Code sessions
    for (let s = 0; s < CC_SESSIONS; s++) {
      const sid = `s7-cc-${s}`;
      db2inner.run(
        `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES (?, ?, '0', '', '', '${SESSION_START}', '${SESSION_START}', 0, '', 0, '${SESSION_START}', 'claude_code')`,
        [sid, sid],
      );
      for (let t = 0; t < CC_TURNS_PER; t++) {
        db2inner.run(
          `INSERT OR IGNORE INTO messages (uuid, session_id, type, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, timestamp) VALUES (?, ?, 'assistant', ?, ?, ?, 0, 0, '${MESSAGE_TS}')`,
          [`s7-cc-${s}-t${t}`, sid, CC_MODEL, CC_INPUT, CC_OUTPUT],
        );
      }
    }

    // Codex sessions
    for (let s = 0; s < CX_SESSIONS; s++) {
      const sid = `s7-cx-${s}`;
      db2inner.run(
        `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, source) VALUES (?, ?, '0', '', '', '${SESSION_START}', '${SESSION_START}', 0, '', 0, '${SESSION_START}', 'codex')`,
        [sid, sid],
      );
      for (let t = 0; t < CX_OBSERVED; t++) {
        db2inner.run(
          `INSERT OR IGNORE INTO messages (uuid, session_id, type, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, timestamp) VALUES (?, ?, 'assistant', ?, ?, ?, 0, 0, '${MESSAGE_TS}')`,
          [`s7-cx-${s}-obs${t}`, sid, CX_MODEL, CX_INPUT, CX_OUTPUT],
        );
      }
      for (let t = 0; t < CX_MISSING; t++) {
        db2inner.run(
          `INSERT OR IGNORE INTO messages (uuid, session_id, type, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, timestamp) VALUES (?, ?, 'assistant', ?, 0, 0, 0, 0, '${MESSAGE_TS}')`,
          [`s7-cx-${s}-miss${t}`, sid, CX_MODEL],
        );
      }
    }
  });

  it('agentStats sum matches getAnalytics totals within ±2', () => {
    const analytics = db2.getAnalytics();
    const combined = db2.getCombinedData('day', 30);
    const agentSum = combined.agentStats.reduce((s, r) => s + r.tokens, 0);
    const totalsSum = analytics.totals.inputTokens + analytics.totals.outputTokens
      + analytics.totals.cacheReadTokens + analytics.totals.cacheCreationTokens;
    expect(Math.abs(agentSum - totalsSum)).toBeLessThanOrEqual(2);
  });

  it('getAnalytics totals have correct Codex factor applied', () => {
    const analytics = db2.getAnalytics();
    // Claude: 5×20×10=1000 input, 1000 output (factor=1)
    // Codex raw: 3×12×5=180 input, 180 output; factor=60/36=5/3; adjusted=300 each
    expect(analytics.totals.inputTokens).toBe(1000 + 300);
    expect(analytics.totals.outputTokens).toBe(1000 + 300);
  });

  it('modelStats Codex tokens match agentStats Codex tokens', () => {
    const combined = db2.getCombinedData('day', 30);
    // Codex model rows are the ones with missing turns > 0 (all other models in db2 have 0 missing)
    const codexModelTokens = combined.modelStats
      .filter(r => r.tokenMissingTurns > 0)
      .reduce((s, r) => s + r.tokens, 0);
    const codexAgentTokens = combined.agentStats
      .filter(r => r.agent === 'Codex')
      .reduce((s, r) => s + r.tokens, 0);
    expect(Math.abs(codexModelTokens - codexAgentTokens)).toBeLessThanOrEqual(2);
  });

  it('modelStats tokenMissingRate correct for Codex and Claude Code rows', () => {
    const combined = db2.getCombinedData('day', 30);
    // Codex rows: tokenMissingTurns > 0
    const cxRows = combined.modelStats.filter(r => r.tokenMissingTurns > 0);
    // CC rows: tokenMissingTurns === 0 and tokenTotalTurns > 0
    const ccRows = combined.modelStats.filter(r => r.tokenMissingTurns === 0 && r.tokenTotalTurns > 0);
    expect(cxRows.length).toBeGreaterThan(0);
    expect(ccRows.length).toBeGreaterThan(0);
    const cxTotalTurns = cxRows.reduce((s, r) => s + r.tokenTotalTurns, 0);
    const cxMissingTurns = cxRows.reduce((s, r) => s + r.tokenMissingTurns, 0);
    // Codex: 24 missing out of 60 total = 0.4
    expect(cxTotalTurns).toBe(CX_SESSIONS * CX_TURNS_PER);
    expect(cxMissingTurns).toBe(CX_SESSIONS * CX_MISSING);
    // Claude Code: no missing
    for (const r of ccRows) {
      expect(r.tokenMissingRate).toBe(0);
    }
  });
});
