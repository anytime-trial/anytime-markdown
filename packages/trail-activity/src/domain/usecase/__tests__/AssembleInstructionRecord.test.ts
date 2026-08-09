// Flight Record: 所属セッションの caravan_flight_reviews を「指示」1 行へ畳む純粋関数の仕様。
// 外部仕様のみを黒箱で検査する（実装の内部構造には触れない）。

import { assembleInstructionRecord } from '../AssembleInstructionRecord';
import type {
  FlightReview,
  Instruction,
  InstructionDeliverable,
  InstructionVerificationRun,
  InstructionTokenUsage,
} from '../../model';

const INSTRUCTION: Instruction = {
  id: 'inst-1',
  workspacePath: '/anytime-markdown',
  workspaceName: 'anytime-markdown',
  summary: 'Flight Review を指示単位へ再設計する',
  originPrompt: 'trail-viewer の Flight Review を指示単位にして',
  originSessionId: 's1',
  startedAt: '2026-08-05T00:00:00.000Z',
  closedAt: null,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

const EMPTY_TOKENS: InstructionTokenUsage = {
  imported: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  estimatedCostUsd: 0,
  byModel: [],
};

function review(overrides: Partial<FlightReview> & Pick<FlightReview, 'sessionId' | 'endedAt'>): FlightReview {
  return {
    id: 0,
    workspacePath: '/anytime-markdown',
    startedAt: null,
    durationSeconds: null,
    outcome: 'unknown',
    outcomeSource: 'machine',
    toolCallCount: 0,
    toolFailureCount: 0,
    reworkCount: 0,
    unresolvedItems: '[]',
    nextConcerns: '[]',
    lessonCandidates: '[]',
    tags: '[]',
    notes: '',
    rationaleAuditStatus: 'unaudited',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

function assemble(reviews: FlightReview[], extra?: {
  sessionCount?: number;
  tokenUsage?: InstructionTokenUsage;
  deliverables?: InstructionDeliverable[];
  verifications?: InstructionVerificationRun[];
}) {
  return assembleInstructionRecord({
    instruction: INSTRUCTION,
    reviews,
    sessionCount: extra?.sessionCount ?? reviews.length,
    tokenUsage: extra?.tokenUsage ?? EMPTY_TOKENS,
    deliverables: extra?.deliverables ?? [],
    verifications: extra?.verifications ?? [],
  });
}

describe('assembleInstructionRecord', () => {
  it('検証実行をそのまま 1 行へ引き継ぐ（指示タブの検証列の入力）', () => {
    const verifications: InstructionVerificationRun[] = [
      {
        kind: 'unit',
        package: 'trail-db',
        command: 'npx jest packages/trail-db',
        status: 'pass',
        durationMs: 1200,
        commitHash: 'abc12345',
        treeState: 'clean',
        codeStateHash: 'abc12345',
        startedAt: '2026-08-05T01:00:00.000Z',
      },
    ];
    const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { verifications });

    expect(record.verifications).toHaveLength(1);
    expect(record.verifications[0]?.kind).toBe('unit');
    expect(record.verifications[0]?.status).toBe('pass');
  });

  it('指示のメタ情報をそのまま 1 行へ引き継ぐ', () => {
    const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })]);

    expect(record.instructionId).toBe('inst-1');
    expect(record.summary).toBe('Flight Review を指示単位へ再設計する');
    expect(record.workspaceName).toBe('anytime-markdown');
    expect(record.workspacePath).toBe('/anytime-markdown');
    expect(record.originPrompt).toBe('trail-viewer の Flight Review を指示単位にして');
    expect(record.closedAt).toBeNull();
  });

  describe('時間', () => {
    it('開始は最小の startedAt、終了は最大の endedAt を採る', () => {
      const record = assemble([
        review({ sessionId: 's2', startedAt: '2026-08-05T03:00:00.000Z', endedAt: '2026-08-05T04:00:00.000Z' }),
        review({ sessionId: 's1', startedAt: '2026-08-05T01:00:00.000Z', endedAt: '2026-08-05T02:00:00.000Z' }),
      ]);

      expect(record.startedAt).toBe('2026-08-05T01:00:00.000Z');
      expect(record.endedAt).toBe('2026-08-05T04:00:00.000Z');
    });

    it('startedAt がすべて null なら最小の endedAt へ縮退する', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T02:00:00.000Z' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z' }),
      ]);

      expect(record.startedAt).toBe('2026-08-05T02:00:00.000Z');
      expect(record.endedAt).toBe('2026-08-05T04:00:00.000Z');
    });

    it('所要時間は実働の合計で、セッション間の空白時間を含めない', () => {
      const record = assemble([
        review({ sessionId: 's1', startedAt: '2026-08-05T01:00:00.000Z', endedAt: '2026-08-05T02:00:00.000Z', durationSeconds: 3600 }),
        review({ sessionId: 's2', startedAt: '2026-08-05T10:00:00.000Z', endedAt: '2026-08-05T11:00:00.000Z', durationSeconds: 3600 }),
      ]);

      // 経過時間は 10 時間だが実働は 2 時間
      expect(record.durationSeconds).toBe(7200);
    });

    it('durationSeconds がすべて null なら null（0 と区別する）', () => {
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T02:00:00.000Z' })]);

      expect(record.durationSeconds).toBeNull();
    });
  });

  describe('成否', () => {
    it('最後のセッションの成否を採る', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z', outcome: 'partial', outcomeSource: 'self' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z', outcome: 'achieved', outcomeSource: 'manual' }),
      ]);

      expect(record.outcome).toBe('achieved');
      expect(record.outcomeSource).toBe('manual');
    });

    it('最後のセッションが unknown なら直近の非 unknown へ後退する', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z', outcome: 'achieved', outcomeSource: 'self' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z', outcome: 'unknown', outcomeSource: 'machine' }),
      ]);

      expect(record.outcome).toBe('achieved');
      expect(record.outcomeSource).toBe('self');
    });

    it('すべて unknown なら unknown のまま（machine 出所）', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z' }),
      ]);

      expect(record.outcome).toBe('unknown');
      expect(record.outcomeSource).toBe('machine');
    });

    it('caravan_flight_reviews が 1 件も無くても行として成立する（未記録を 0 件成果に見せない）', () => {
      const record = assemble([], { sessionCount: 2 });

      expect(record.outcome).toBe('unknown');
      expect(record.sessionCount).toBe(2);
      expect(record.startedAt).toBeNull();
      expect(record.endedAt).toBeNull();
      expect(record.durationSeconds).toBeNull();
    });
  });

  describe('件数とタグ', () => {
    it('ツール呼出・失敗・手戻りは所属セッションの合計', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z', toolCallCount: 10, toolFailureCount: 2, reworkCount: 1 }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z', toolCallCount: 5, toolFailureCount: 1, reworkCount: 3 }),
      ]);

      expect(record.toolCallCount).toBe(15);
      expect(record.toolFailureCount).toBe(3);
      expect(record.reworkCount).toBe(4);
    });

    it('セッション数は caravan_flight_reviews の件数ではなく所属セッション数', () => {
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { sessionCount: 3 });

      expect(record.sessionCount).toBe(3);
    });

    it('タグは和集合で重複しない', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z', tags: '["ui","trail"]' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z', tags: '["trail","release"]' }),
      ]);

      expect(record.tags).toEqual(['ui', 'trail', 'release']);
    });

    it('壊れた JSON のタグは無視して他セッションのタグを残す', () => {
      const record = assemble([
        review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z', tags: 'not json' }),
        review({ sessionId: 's2', endedAt: '2026-08-05T04:00:00.000Z', tags: '["trail"]' }),
      ]);

      expect(record.tags).toEqual(['trail']);
    });
  });

  describe('トークン消費と成果物', () => {
    it('渡されたトークン集計をそのまま持つ', () => {
      const tokenUsage: InstructionTokenUsage = {
        imported: true,
        inputTokens: 1288,
        outputTokens: 481192,
        cacheReadTokens: 153232450,
        cacheCreationTokens: 1711219,
        estimatedCostUsd: 99.348,
        byModel: [
          { model: 'opus', inputTokens: 1288, outputTokens: 481192, cacheReadTokens: 153232450, cacheCreationTokens: 1711219, estimatedCostUsd: 99.348 },
        ],
      };
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { tokenUsage });

      expect(record.tokenUsage.estimatedCostUsd).toBeCloseTo(99.348);
      expect(record.tokenUsage.byModel).toHaveLength(1);
      expect(record.tokenUsage.imported).toBe(true);
    });

    it('コミット由来の相対パスとツール由来の絶対パスが同じファイルなら 1 件に畳む', () => {
      // コミットはリポジトリ相対、ツール呼出は絶対パスで残る（実データで確認済み）
      const deliverables: InstructionDeliverable[] = [
        { kind: 'doc', filePath: '/Shared/anytime-markdown-docs/spec/a.md', committed: false, commitHash: '' },
        { kind: 'doc', filePath: 'spec/a.md', committed: true, commitHash: 'abc1234' },
      ];
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { deliverables });

      expect(record.deliverables).toHaveLength(1);
      expect(record.deliverables[0]?.committed).toBe(true);
      expect(record.deliverables[0]?.filePath).toBe('spec/a.md');
    });

    it('末尾が偶然似ているだけのパスは別の成果物として残す', () => {
      const deliverables: InstructionDeliverable[] = [
        { kind: 'doc', filePath: '/ws/xa/b.md', committed: false, commitHash: '' },
        { kind: 'doc', filePath: 'a/b.md', committed: true, commitHash: 'abc1234' },
      ];
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { deliverables });

      expect(record.deliverables).toHaveLength(2);
    });

    it('成果物は同一パスの重複を畳み、コミット済みを優先する', () => {
      const deliverables: InstructionDeliverable[] = [
        { kind: 'doc', filePath: 'spec/a.md', committed: false, commitHash: '' },
        { kind: 'doc', filePath: 'spec/a.md', committed: true, commitHash: 'abc1234' },
        { kind: 'code', filePath: 'src/b.ts', committed: true, commitHash: 'abc1234' },
      ];
      const record = assemble([review({ sessionId: 's1', endedAt: '2026-08-05T01:00:00.000Z' })], { deliverables });

      expect(record.deliverables).toHaveLength(2);
      const doc = record.deliverables.find((d) => d.filePath === 'spec/a.md');
      expect(doc?.committed).toBe(true);
      expect(doc?.commitHash).toBe('abc1234');
    });
  });
});
