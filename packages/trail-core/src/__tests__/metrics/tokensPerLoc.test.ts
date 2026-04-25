import { computeTokensPerLoc } from '../../domain/metrics/tokensPerLoc';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

function makeMessage(uuid: string, createdAt: string, tokens: { in?: number; out?: number; cr?: number; cc?: number } = {}) {
  return {
    uuid,
    created_at: createdAt,
    input_tokens: tokens.in ?? 0,
    output_tokens: tokens.out ?? 0,
    cache_read_tokens: tokens.cr ?? 0,
    cache_creation_tokens: tokens.cc ?? 0,
  };
}

describe('computeTokensPerLoc', () => {
  it('empty inputs → value=0, sampleSize=0', () => {
    const result = computeTokensPerLoc(
      { messages: [], messageCommits: [], commits: [] },
      range,
      prevRange,
      'day',
    );
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.unit).toBe('tokensPerLoc');
  });

  it('single commit single prompt → sum of 4 token types / churn', () => {
    const inputs = {
      messages: [makeMessage('m0', '2026-04-10T00:00:00.000Z', { in: 100, out: 200, cr: 300, cc: 400 })],
      messageCommits: [{ message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T01:00:00.000Z', match_confidence: 'high' }],
      commits: [{ hash: 'c1', lines_added: 60, lines_deleted: 40 }],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(10, 1);
    expect(result.sampleSize).toBe(1);
  });

  it('multiple prompts per commit → tokens summed across prompts', () => {
    const inputs = {
      messages: [
        makeMessage('m0', '2026-04-10T10:00:00.000Z', { in: 100, out: 100 }),
        makeMessage('m1', '2026-04-10T10:15:00.000Z', { in: 100, out: 100 }),
      ],
      messageCommits: [
        { message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T10:30:00.000Z', match_confidence: 'high' },
        { message_uuid: 'm1', commit_hash: 'c1', detected_at: '2026-04-10T10:30:00.000Z', match_confidence: 'high' },
      ],
      commits: [{ hash: 'c1', lines_added: 60, lines_deleted: 40 }],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(4, 1);
    expect(result.sampleSize).toBe(1);
  });

  it('multiple commits → sum-based ratio', () => {
    const inputs = {
      messages: [
        makeMessage('m0', '2026-04-10T00:00:00.000Z', { in: 1000 }),
        makeMessage('m1', '2026-04-11T00:00:00.000Z', { in: 2000 }),
      ],
      messageCommits: [
        { message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T01:00:00.000Z', match_confidence: 'high' },
        { message_uuid: 'm1', commit_hash: 'c2', detected_at: '2026-04-11T02:00:00.000Z', match_confidence: 'high' },
      ],
      commits: [
        { hash: 'c1', lines_added: 50, lines_deleted: 50 },
        { hash: 'c2', lines_added: 100, lines_deleted: 0 },
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(15, 1);
    expect(result.sampleSize).toBe(2);
  });

  it('excludes commits with churn=0', () => {
    const inputs = {
      messages: [
        makeMessage('m0', '2026-04-10T00:00:00.000Z', { in: 1000 }),
        makeMessage('m1', '2026-04-11T00:00:00.000Z', { in: 1000 }),
      ],
      messageCommits: [
        { message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T01:00:00.000Z', match_confidence: 'high' },
        { message_uuid: 'm1', commit_hash: 'c2', detected_at: '2026-04-11T02:00:00.000Z', match_confidence: 'high' },
      ],
      commits: [
        { hash: 'c1', lines_added: 0, lines_deleted: 0 },
        { hash: 'c2', lines_added: 100, lines_deleted: 0 },
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(10, 1);
  });

  it('excludes match_confidence=low', () => {
    const inputs = {
      messages: [
        makeMessage('m0', '2026-04-10T00:00:00.000Z', { in: 1000 }),
        makeMessage('m1', '2026-04-11T00:00:00.000Z', { in: 1000 }),
      ],
      messageCommits: [
        { message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T01:00:00.000Z', match_confidence: 'low' },
        { message_uuid: 'm1', commit_hash: 'c2', detected_at: '2026-04-11T02:00:00.000Z', match_confidence: 'high' },
      ],
      commits: [
        { hash: 'c1', lines_added: 100, lines_deleted: 0 },
        { hash: 'c2', lines_added: 100, lines_deleted: 0 },
      ],
    };
    const result = computeTokensPerLoc(inputs, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBeCloseTo(10, 1);
  });

  it('deltaPct calculated from previous period', () => {
    const current = {
      messages: [makeMessage('m0', '2026-04-10T00:00:00.000Z', { in: 1000 })],
      messageCommits: [{ message_uuid: 'm0', commit_hash: 'c1', detected_at: '2026-04-10T01:00:00.000Z', match_confidence: 'high' }],
      commits: [{ hash: 'c1', lines_added: 100, lines_deleted: 0 }],
    };
    const prev = {
      messages: [makeMessage('m0', '2026-03-10T00:00:00.000Z', { in: 2000 })],
      messageCommits: [{ message_uuid: 'm0', commit_hash: 'c0', detected_at: '2026-03-10T01:00:00.000Z', match_confidence: 'high' }],
      commits: [{ hash: 'c0', lines_added: 100, lines_deleted: 0 }],
    };
    const result = computeTokensPerLoc(current, range, prevRange, 'day', prev);
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.previousValue).toBeCloseTo(20, 1);
    expect(result.comparison!.deltaPct).toBeCloseTo(-50, 1);
  });
});
