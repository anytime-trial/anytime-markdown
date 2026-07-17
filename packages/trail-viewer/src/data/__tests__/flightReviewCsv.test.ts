import { buildFlightReviewCsv } from '../flightReviewCsv';
import type { FlightReviewDto } from '../flightReviewStore';

function review(overrides: Partial<FlightReviewDto> = {}): FlightReviewDto {
  return {
    id: 1,
    sessionId: 'sess-1',
    workspacePath: '/ws',
    startedAt: '2026-07-17T09:00:00.000Z',
    endedAt: '2026-07-17T10:00:00.000Z',
    durationSeconds: 3600,
    outcome: 'achieved',
    outcomeSource: 'manual',
    toolCallCount: 10,
    toolFailureCount: 1,
    reworkCount: 2,
    unresolvedItems: '[]',
    nextConcerns: '[]',
    lessonCandidates: '[]',
    tags: '["release"]',
    notes: 'ok',
    createdAt: '2026-07-17T10:00:01.000Z',
    updatedAt: '2026-07-17T10:00:01.000Z',
    ...overrides,
  };
}

describe('buildFlightReviewCsv', () => {
  it('ヘッダ行 + データ行を CRLF 区切りで生成する（FR-19）', () => {
    const csv = buildFlightReviewCsv([review()]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'sessionId,startedAt,endedAt,durationSeconds,outcome,outcomeSource,toolCallCount,toolFailureCount,reworkCount,tags,notes',
    );
    expect(lines[1]).toBe(
      'sess-1,2026-07-17T09:00:00.000Z,2026-07-17T10:00:00.000Z,3600,achieved,manual,10,1,2,"[""release""]",ok',
    );
  });

  it('カンマ・引用符・改行を含むフィールドを RFC 4180 でエスケープする（FR-19）', () => {
    const csv = buildFlightReviewCsv([
      review({ notes: 'a,b\n"quoted"', tags: '[]' }),
    ]);
    const dataPart = csv.split('\r\n').slice(1).join('\r\n');
    expect(dataPart).toContain('"a,b\n""quoted"""');
  });

  it('null 値（startedAt / durationSeconds）は空フィールドになる', () => {
    const csv = buildFlightReviewCsv([review({ startedAt: null, durationSeconds: null })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('sess-1,,2026-07-17T10:00:00.000Z,,achieved,manual,10,1,2,"[""release""]",ok');
  });

  it('= + - @ で始まる文字列フィールドは式評価を無効化する（formula injection 対策）', () => {
    const csv = buildFlightReviewCsv([review({ notes: '=SUM(A1:A9)', tags: '[]' })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain("'=SUM(A1:A9)");
    // 数値フィールドは対象外（プレフィクスが付かない）
    expect(lines[1]).toContain(',3600,');
  });

  it('0 件でもヘッダ行のみの CSV を返す', () => {
    const csv = buildFlightReviewCsv([]);
    expect(csv.split('\r\n')).toHaveLength(1);
  });
});
