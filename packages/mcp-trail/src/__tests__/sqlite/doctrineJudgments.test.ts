import BetterSqlite3, { type Database } from 'better-sqlite3';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
  recordHumanDecisionDirect,
  recordDelegatedApprovalDirect,
  getDoctrineAgreementDirect,
  listDoctrineJudgmentsBySession,
  type DoctrineJudgmentInput,
} from '../../sqlite/doctrineJudgments';
import type { CitationApproval, ResolvedCitation } from '../../doctrine/resolveCitations';

function resolvedCitation(resolved = true, approval: CitationApproval = 'canon'): ResolvedCitation {
  return {
    docPath: '/docs/spec/92.doctrine/principles.ja.md',
    section: 'エラー処理',
    quote: 'ゲートは fail-closed、記録は fail-open とする。',
    resolved,
    reason: resolved ? 'ok' : 'quote_not_found',
    approval: resolved ? approval : 'unknown',
  };
}

function judgment(overrides: Partial<DoctrineJudgmentInput> = {}): DoctrineJudgmentInput {
  return {
    sessionId: 'session-1',
    subject: 'doctrine-judgment 機能仕様書の What 承認',
    judgment: 'approve',
    coverage: 'covered',
    citations: [resolvedCitation()],
    ...overrides,
  };
}

describe('doctrineJudgments', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    ensureDoctrineJudgmentsTable(db);
  });

  afterEach(() => {
    db.close();
  });

  it('接地判断を記録し、引用ごとの解決結果と件数が保存される', () => {
    const result = recordDoctrineJudgmentDirect(db, {
      ...judgment(),
      citations: [resolvedCitation(true), resolvedCitation(false)],
    });
    expect(result.citationCount).toBe(2);
    expect(result.resolvedCount).toBe(1);
    const row = db
      .prepare('SELECT citations_json, citation_count, resolved_count FROM doctrine_judgments')
      .get() as { citations_json: string; citation_count: number; resolved_count: number };
    expect(JSON.parse(row.citations_json)).toHaveLength(2);
    expect(row.citation_count).toBe(2);
    expect(row.resolved_count).toBe(1);
  });

  it('同一セッション・同一対象の再記録は 1 行のまま上書きし、既存の人の判断を無効化する', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    recordDoctrineJudgmentDirect(db, judgment({ judgment: 'reject' }));
    const rows = db
      .prepare('SELECT agent_judgment, human_decision FROM doctrine_judgments')
      .all() as Array<{ agent_judgment: string; human_decision: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ agent_judgment: 'reject', human_decision: null });
  });

  it('人の判断の後追い記録で一致 / 不一致が確定する', () => {
    recordDoctrineJudgmentDirect(db, judgment());
    const matched = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    expect(matched.agreement).toBe(true);

    recordDoctrineJudgmentDirect(db, judgment({ subject: '別件の承認' }));
    const mismatched = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: '別件の承認',
      decision: 'modified',
    });
    expect(mismatched.agreement).toBe(false);
  });

  it('escalate 判断への人の判断は一致率の対象外（agreement=null）', () => {
    recordDoctrineJudgmentDirect(db, judgment({ judgment: 'escalate', coverage: 'silent' }));
    const result = recordHumanDecisionDirect(db, {
      sessionId: 'session-1',
      subject: judgment().subject,
      decision: 'approve',
    });
    expect(result.agreement).toBeNull();
  });

  it("coverage='covered' は根拠引用なしでは記録できない（DCT-9）", () => {
    expect(() =>
      recordDoctrineJudgmentDirect(db, { ...judgment(), citations: [] }),
    ).toThrow(/requires at least one citation/);
  });

  it("coverage='silent' 等のエスカレーション系は空引用を許容する", () => {
    const result = recordDoctrineJudgmentDirect(db, {
      ...judgment({ judgment: 'escalate', coverage: 'silent' }),
      citations: [],
    });
    expect(result.citationCount).toBe(0);
  });

  it('人の判断はレコード id でも突合できる（record が返す最安定キー）', () => {
    const recorded = recordDoctrineJudgmentDirect(db, judgment());
    const result = recordHumanDecisionDirect(db, { id: recorded.id, decision: 'approve' });
    expect(result.agreement).toBe(true);
  });

  it('id も (sessionId + subject) も無い人の判断記録はエラー', () => {
    expect(() => recordHumanDecisionDirect(db, { decision: 'approve' })).toThrow(
      /requires id or/,
    );
  });

  it('対応レコードがない人の判断記録はエラー（黙って新規作成しない）', () => {
    expect(() =>
      recordHumanDecisionDirect(db, {
        sessionId: 'no-such-session',
        subject: 'なにか',
        decision: 'approve',
      }),
    ).toThrow(/not found/);
  });

  it('集計が一致率・エスカレーション率・引用解決率・未突合件数を返す', () => {
    // covered + 一致
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'A' }));
    recordHumanDecisionDirect(db, { sessionId: 'session-1', subject: 'A', decision: 'approve' });
    // covered + 不一致
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'B' }));
    recordHumanDecisionDirect(db, { sessionId: 'session-1', subject: 'B', decision: 'reject' });
    // silent + escalate（一致率の分母外・エスカレーション）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'C', judgment: 'escalate', coverage: 'silent' }),
      citations: [resolvedCitation(false)],
    });
    // covered + 未突合
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'D' }));

    const metrics = getDoctrineAgreementDirect(db);
    expect(metrics.total).toBe(4);
    expect(metrics.decided).toBe(2);
    expect(metrics.pending).toBe(2);
    expect(metrics.agreementRate).toBe(0.5);
    expect(metrics.escalationRate).toBe(0.25);
    // 引用 4 件中 3 件解決（A/B/D が resolved、C が未解決）
    expect(metrics.citationResolutionRate).toBe(0.75);
  });

  it('canon 接地率は covered 判断のうち canon 引用を持つ割合（DCT-3）', () => {
    // covered + canon 引用
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'canon 接地' }));
    // covered + draft 引用のみ（未承認条項を根拠にした判断）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'draft 接地' }),
      citations: [resolvedCitation(true, 'draft')],
    });
    // silent（covered ではないため分母外）
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'escalate', judgment: 'escalate', coverage: 'silent' }),
      citations: [],
    });

    const metrics = getDoctrineAgreementDirect(db);
    expect(metrics.canonGroundedRate).toBe(0.5);
  });

  it('明文規約（canon_by_document）の引用も canon 接地として数える', () => {
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'CLAUDE.md 接地' }),
      citations: [resolvedCitation(true, 'canon_by_document')],
    });
    expect(getDoctrineAgreementDirect(db).canonGroundedRate).toBe(1);
  });

  it('承認状態を持たない旧レコードは canon 接地なしと数える', () => {
    recordDoctrineJudgmentDirect(db, judgment({ subject: '旧記録' }));
    // 本機能より前の citations_json（approval フィールドを持たない）を再現する
    db.prepare('UPDATE doctrine_judgments SET citations_json = ?').run(
      JSON.stringify([{ docPath: '/docs/x.md', section: 'a', quote: 'b', resolved: true, reason: 'ok' }]),
    );
    expect(getDoctrineAgreementDirect(db).canonGroundedRate).toBe(0);
  });

  it('ゲート判定を保存し、代行可能率を集計する（DCT-10〜12）', () => {
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: '代行可' }),
      gate: { verdict: 'delegable', reasons: [] },
    });
    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: '代行不可' }),
      gate: { verdict: 'escalate', reasons: ['severity_high'] },
    });
    const row = db
      .prepare(`SELECT gate_verdict, gate_reasons_json FROM doctrine_judgments WHERE subject = ?`)
      .get('代行不可') as { gate_verdict: string; gate_reasons_json: string };
    expect(row.gate_verdict).toBe('escalate');
    expect(JSON.parse(row.gate_reasons_json)).toEqual(['severity_high']);
    expect(getDoctrineAgreementDirect(db).delegableRate).toBe(0.5);
  });

  it('ゲート未評価のレコードは代行可能率の分母から除く', () => {
    recordDoctrineJudgmentDirect(db, judgment({ subject: 'ゲートなし' }));
    expect(getDoctrineAgreementDirect(db).delegableRate).toBeNull();

    recordDoctrineJudgmentDirect(db, {
      ...judgment({ subject: 'ゲートあり' }),
      gate: { verdict: 'delegable', reasons: [] },
    });
    expect(getDoctrineAgreementDirect(db).delegableRate).toBe(1);
  });

  describe('recordDelegatedApprovalDirect（D2 代行の記録）', () => {
    function delegableJudgment(subject: string): DoctrineJudgmentInput {
      return { ...judgment({ subject }), gate: { verdict: 'delegable', reasons: [] } };
    }

    it('ゲートが delegable かつ approve 判断なら代行として記録する', () => {
      const { id } = recordDoctrineJudgmentDirect(db, delegableJudgment('代行した'));
      const result = recordDelegatedApprovalDirect(db, {
        id,
        delegatedAt: '2026-08-05T00:00:00.000Z',
      });
      expect(result).toEqual({
        id,
        delegatedAt: '2026-08-05T00:00:00.000Z',
        alreadyDelegated: false,
      });
      const row = db
        .prepare(`SELECT delegated_at FROM doctrine_judgments WHERE id = ?`)
        .get(id) as { delegated_at: string };
      expect(row.delegated_at).toBe('2026-08-05T00:00:00.000Z');
    });

    it('(sessionId + subject) でも突合できる', () => {
      recordDoctrineJudgmentDirect(db, delegableJudgment('キー突合'));
      const result = recordDelegatedApprovalDirect(db, {
        sessionId: 'session-1',
        subject: 'キー突合',
      });
      expect(result.delegatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('ゲートが escalate の判断は代行として記録できない（fail-closed）', () => {
      const { id } = recordDoctrineJudgmentDirect(db, {
        ...judgment({ subject: 'エスカレーション' }),
        gate: { verdict: 'escalate', reasons: ['severity_high'] },
      });
      expect(() => recordDelegatedApprovalDirect(db, { id })).toThrow(/gate verdict/);
      const row = db
        .prepare(`SELECT delegated_at FROM doctrine_judgments WHERE id = ?`)
        .get(id) as { delegated_at: string | null };
      expect(row.delegated_at).toBeNull();
    });

    it('ゲート未評価（旧レコード）は代行として記録できない', () => {
      const { id } = recordDoctrineJudgmentDirect(db, judgment({ subject: 'ゲートなし' }));
      expect(() => recordDelegatedApprovalDirect(db, { id })).toThrow(/gate verdict/);
    });

    it('approve 以外の判断は代行として記録できない（代行対象は What 承認のみ）', () => {
      const { id } = recordDoctrineJudgmentDirect(db, {
        ...judgment({ subject: '却下判断' }),
        judgment: 'reject',
        gate: { verdict: 'delegable', reasons: [] },
      });
      expect(() => recordDelegatedApprovalDirect(db, { id })).toThrow(/agent judgment/);
    });

    it('人の判断が既にある判断は代行として記録できない', () => {
      const { id } = recordDoctrineJudgmentDirect(db, delegableJudgment('人が判断済み'));
      recordHumanDecisionDirect(db, { id, decision: 'approve' });
      expect(() => recordDelegatedApprovalDirect(db, { id })).toThrow(/human decision/);
    });

    it('代行済みの再記録は時刻を上書きせず、最初の記録を返す（監査ログの不変性）', () => {
      const { id } = recordDoctrineJudgmentDirect(db, delegableJudgment('再送'));
      recordDelegatedApprovalDirect(db, { id, delegatedAt: '2026-08-05T00:00:00.000Z' });

      const again = recordDelegatedApprovalDirect(db, {
        id,
        delegatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(again).toEqual({
        id,
        delegatedAt: '2026-08-05T00:00:00.000Z',
        alreadyDelegated: true,
      });
      const row = db
        .prepare(`SELECT delegated_at FROM doctrine_judgments WHERE id = ?`)
        .get(id) as { delegated_at: string };
      expect(row.delegated_at).toBe('2026-08-05T00:00:00.000Z');
    });

    it('対応レコードがない代行記録はエラー（黙って新規作成しない）', () => {
      expect(() => recordDelegatedApprovalDirect(db, { id: 9999 })).toThrow(/not found/);
    });

    it('判断の再記録は代行の記録も無効化する（判断が変われば代行の根拠も失われる）', () => {
      const { id } = recordDoctrineJudgmentDirect(db, delegableJudgment('再記録'));
      recordDelegatedApprovalDirect(db, { id });
      recordDoctrineJudgmentDirect(db, delegableJudgment('再記録'));
      const row = db
        .prepare(`SELECT delegated_at FROM doctrine_judgments WHERE id = ?`)
        .get(id) as { delegated_at: string | null };
      expect(row.delegated_at).toBeNull();
    });

    it('代行済みは未突合（pending）から外し、代行件数として数える', () => {
      recordDoctrineJudgmentDirect(db, delegableJudgment('代行済み'));
      recordDoctrineJudgmentDirect(db, judgment({ subject: '人待ち' }));
      recordDelegatedApprovalDirect(db, { sessionId: 'session-1', subject: '代行済み' });

      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.total).toBe(2);
      expect(metrics.delegated).toBe(1);
      expect(metrics.pending).toBe(1);
    });

    it('代行後に人が抜き取り監査で判断すると一致率へ反映される', () => {
      const { id } = recordDoctrineJudgmentDirect(db, delegableJudgment('抜き取り監査'));
      recordDelegatedApprovalDirect(db, { id });
      const audit = recordHumanDecisionDirect(db, { id, decision: 'reject' });
      expect(audit.agreement).toBe(false);

      const metrics = getDoctrineAgreementDirect(db);
      expect(metrics.agreementRate).toBe(0);
      expect(metrics.delegated).toBe(1);
      expect(metrics.delegatedAudited).toBe(1);
      expect(metrics.pending).toBe(0);
      // decided は代行後の監査を含むため delegated と重なる。
      // `decided + pending = total` は成り立たない
      expect(
        metrics.decided + metrics.delegated - metrics.delegatedAudited + metrics.pending,
      ).toBe(metrics.total);
    });
  });

  it('gate 列を持たない旧スキーマの DB へ冪等に列追加する', () => {
    const legacy = new BetterSqlite3(':memory:');
    legacy.exec(`CREATE TABLE doctrine_judgments (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      agent_judgment TEXT NOT NULL,
      coverage TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      citation_count INTEGER NOT NULL DEFAULT 0,
      resolved_count INTEGER NOT NULL DEFAULT 0,
      human_decision TEXT,
      judged_at TEXT NOT NULL,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (session_id, subject)
    )`);
    legacy
      .prepare(
        `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, judged_at, created_at, updated_at)
         VALUES ('s', '旧行', 'approve', 'covered', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      )
      .run();

    ensureDoctrineJudgmentsTable(legacy);
    ensureDoctrineJudgmentsTable(legacy);

    const columns = (
      legacy.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(['gate_verdict', 'gate_reasons_json', 'delegated_at']),
    );
    // 新規 DB と移行 DB で列順まで一致させる（ALTER は必ず末尾へ足すため、CREATE 側も
    // 追加列を末尾に置く。食い違うと SELECT * の列位置が経路で変わる）
    const fresh = new BetterSqlite3(':memory:');
    ensureDoctrineJudgmentsTable(fresh);
    const freshColumns = (
      fresh.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(columns).toEqual(freshColumns);
    fresh.close();
    const rows = legacy
      .prepare(`SELECT subject, gate_verdict, delegated_at FROM doctrine_judgments`)
      .all();
    expect(rows).toEqual([{ subject: '旧行', gate_verdict: null, delegated_at: null }]);
    // 列名・列順だけでなく制約も見る。ALTER 側の CHECK 式が CREATE 側から
    // 剥がれると、移行 DB だけが不正な値を受理する状態になる
    expect(() =>
      legacy.exec(`UPDATE doctrine_judgments SET delegated_at = 'garbage'`),
    ).toThrow(/CHECK constraint failed/);
    legacy.close();
  });

  it('期間指定（since/until）で集計対象を絞れる', () => {
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '過去' }), judgedAt: '2026-01-01T00:00:00.000Z' });
    recordDoctrineJudgmentDirect(db, { ...judgment({ subject: '現在' }), judgedAt: '2026-08-02T00:00:00.000Z' });
    const metrics = getDoctrineAgreementDirect(db, { since: '2026-06-01T00:00:00.000Z' });
    expect(metrics.total).toBe(1);
  });

  describe('listDoctrineJudgmentsBySession', () => {
    it('対象セッションの判断だけを judged_at 昇順で返す', () => {
      recordDoctrineJudgmentDirect(db, {
        ...judgment({ subject: '後' }),
        judgedAt: '2026-08-02T02:00:00.000Z',
      });
      recordDoctrineJudgmentDirect(db, {
        ...judgment({ subject: '先' }),
        judgedAt: '2026-08-02T01:00:00.000Z',
      });
      recordDoctrineJudgmentDirect(db, {
        ...judgment({ subject: '別セッション', sessionId: 'session-2' }),
      });

      const rows = listDoctrineJudgmentsBySession(db, 'session-1');

      expect(rows.map((r) => r.subject)).toEqual(['先', '後']);
      expect(rows[0]?.sessionId).toBe('session-1');
    });

    it('引用・ゲート判定・人の判断を復元する', () => {
      const recorded = recordDoctrineJudgmentDirect(db, {
        ...judgment(),
        gate: { verdict: 'escalate', reasons: ['no_canon_citation'] },
      });
      recordHumanDecisionDirect(db, { id: recorded.id, decision: 'modified' });

      const [row] = listDoctrineJudgmentsBySession(db, 'session-1');

      expect(row?.citations).toEqual([resolvedCitation()]);
      expect(row?.gateVerdict).toBe('escalate');
      expect(row?.gateReasons).toEqual(['no_canon_citation']);
      expect(row?.humanDecision).toBe('modified');
      expect(row?.decidedAt).not.toBeNull();
      expect(row?.parseError).toBeNull();
    });

    it('ゲート未評価の記録は verdict null・理由なしで返す', () => {
      recordDoctrineJudgmentDirect(db, judgment());

      const [row] = listDoctrineJudgmentsBySession(db, 'session-1');

      expect(row?.gateVerdict).toBeNull();
      expect(row?.gateReasons).toEqual([]);
      expect(row?.humanDecision).toBeNull();
    });

    it('配列でない citations_json はレコードを落とさず parseError を立てる', () => {
      // json_valid の CHECK は通るが形が違う値（外部書込・スキーマ変更の取りこぼし）。
      // JSON.parse は成功するため、パース可否だけの防御では素通りする
      recordDoctrineJudgmentDirect(db, judgment());
      db.prepare(
        `UPDATE doctrine_judgments SET citations_json = '"not-an-array"' WHERE session_id = ?`,
      ).run('session-1');

      const [row] = listDoctrineJudgmentsBySession(db, 'session-1');

      expect(row?.subject).toBe('doctrine-judgment 機能仕様書の What 承認');
      expect(row?.citations).toEqual([]);
      expect(row?.parseError).not.toBeNull();
    });

    it('不正な JSON を持つ旧 DB（CHECK なし）でもレコードを落とさない', () => {
      // 現行スキーマは json_valid の CHECK を持つが、CHECK 導入前に書かれた行は
      // 素通りしている可能性がある
      const legacy = new BetterSqlite3(':memory:');
      legacy.exec(`CREATE TABLE doctrine_judgments (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        agent_judgment TEXT NOT NULL,
        coverage TEXT NOT NULL,
        citations_json TEXT NOT NULL DEFAULT '[]',
        citation_count INTEGER NOT NULL DEFAULT 0,
        resolved_count INTEGER NOT NULL DEFAULT 0,
        human_decision TEXT,
        judged_at TEXT NOT NULL,
        decided_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (session_id, subject)
      )`);
      legacy
        .prepare(
          `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, citations_json, judged_at, created_at, updated_at)
           VALUES ('s', '旧行', 'approve', 'covered', '{壊れた JSON', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
        )
        .run();

      const [row] = listDoctrineJudgmentsBySession(legacy, 's');

      expect(row?.subject).toBe('旧行');
      expect(row?.citations).toEqual([]);
      expect(row?.parseError).not.toBeNull();
      legacy.close();
    });

    it('判断が 0 件のセッションは空配列を返す（例外にしない）', () => {
      expect(listDoctrineJudgmentsBySession(db, 'session-none')).toEqual([]);
    });

    it('テーブルが無い DB では空配列を返す（提示のために作らない）', () => {
      const empty = new BetterSqlite3(':memory:');
      expect(listDoctrineJudgmentsBySession(empty, 'session-1')).toEqual([]);
      expect(
        empty
          .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .all('doctrine_judgments'),
      ).toEqual([]);
      empty.close();
    });

    it('gate 列が無い旧 DB でも列を追加せず NULL として読む', () => {
      const legacy = new BetterSqlite3(':memory:');
      legacy.exec(`CREATE TABLE doctrine_judgments (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        agent_judgment TEXT NOT NULL,
        coverage TEXT NOT NULL,
        citations_json TEXT NOT NULL DEFAULT '[]',
        citation_count INTEGER NOT NULL DEFAULT 0,
        resolved_count INTEGER NOT NULL DEFAULT 0,
        human_decision TEXT,
        judged_at TEXT NOT NULL,
        decided_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (session_id, subject)
      )`);
      legacy
        .prepare(
          `INSERT INTO doctrine_judgments (session_id, subject, agent_judgment, coverage, judged_at, created_at, updated_at)
           VALUES ('s', '旧行', 'approve', 'covered', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
        )
        .run();

      const [row] = listDoctrineJudgmentsBySession(legacy, 's');

      expect(row?.gateVerdict).toBeNull();
      expect(row?.gateReasons).toEqual([]);
      const columns = (
        legacy.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>
      ).map((c) => c.name);
      expect(columns).not.toContain('gate_verdict');
      legacy.close();
    });
  });
});
