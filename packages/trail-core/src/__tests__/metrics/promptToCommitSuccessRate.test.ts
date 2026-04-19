import { computePromptToCommitSuccessRate } from '../../domain/metrics/promptToCommitSuccessRate';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

function makeMsg(uuid: string, at: string, role = 'user', type = 'text') {
  return { uuid, created_at: at, role, type };
}

describe('computePromptToCommitSuccessRate', () => {
  it('0 messages → value=0, sampleSize=0, no level', () => {
    const result = computePromptToCommitSuccessRate({ messages: [], messageCommits: [] }, range, prevRange, 'day');
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.level).toBeUndefined();
    expect(result.unit).toBe('percent');
  });

  it('all user prompts produce commits → 100%', () => {
    const messages = [
      makeMsg('m0', '2026-04-10T00:00:00.000Z'),
      makeMsg('m1', '2026-04-11T00:00:00.000Z'),
    ];
    const messageCommits = [
      { message_uuid: 'm0' },
      { message_uuid: 'm1' },
    ];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.value).toBe(100);
    expect(result.sampleSize).toBe(2);
  });

  it('partial success → correct percentage', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMsg(`m${i}`, '2026-04-10T00:00:00.000Z'),
    );
    const messageCommits = [{ message_uuid: 'm0' }, { message_uuid: 'm1' }, { message_uuid: 'm2' }];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.value).toBeCloseTo(30, 1);
    expect(result.sampleSize).toBe(10);
  });

  it('excludes assistant role messages from denominator', () => {
    const messages = [
      makeMsg('m0', '2026-04-10T00:00:00.000Z', 'user'),
      makeMsg('m1', '2026-04-10T00:00:00.000Z', 'assistant'),
    ];
    const messageCommits = [{ message_uuid: 'm0' }];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1); // only user messages
    expect(result.value).toBe(100);
  });

  it('excludes tool_use type messages from denominator', () => {
    const messages = [
      makeMsg('m0', '2026-04-10T00:00:00.000Z', 'user', 'text'),
      makeMsg('m1', '2026-04-10T00:00:00.000Z', 'user', 'tool_use'),
    ];
    const messageCommits = [{ message_uuid: 'm0' }];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1); // only text type user messages
    expect(result.value).toBe(100);
  });

  it('excludes messages outside range', () => {
    const messages = [
      makeMsg('m0', '2026-03-01T00:00:00.000Z'), // outside
      makeMsg('m1', '2026-04-10T00:00:00.000Z'), // inside
    ];
    const messageCommits = [{ message_uuid: 'm1' }];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBe(100);
  });

  it('deltaPct calculated from previous period', () => {
    const messages = [makeMsg('m0', '2026-04-10T00:00:00.000Z')];
    const messageCommits = [{ message_uuid: 'm0' }];
    const prevMessages = [
      makeMsg('pm0', '2026-03-10T00:00:00.000Z'),
      makeMsg('pm1', '2026-03-11T00:00:00.000Z'),
    ];
    const prevCommits = [{ message_uuid: 'pm0' }]; // 50%
    const result = computePromptToCommitSuccessRate(
      { messages, messageCommits },
      range,
      prevRange,
      'day',
      { messages: prevMessages, messageCommits: prevCommits },
    );
    expect(result.comparison).toBeDefined();
    expect(result.comparison!.previousValue).toBeCloseTo(50, 1);
    expect(result.comparison!.deltaPct).toBeCloseTo(100, 1); // 100% vs 50%
  });

  it('deltaPct=null when previous has 0 user messages', () => {
    const messages = [makeMsg('m0', '2026-04-10T00:00:00.000Z')];
    const messageCommits = [{ message_uuid: 'm0' }];
    const result = computePromptToCommitSuccessRate(
      { messages, messageCommits },
      range,
      prevRange,
      'day',
      { messages: [], messageCommits: [] },
    );
    expect(result.comparison!.deltaPct).toBeNull();
  });

  it('level is always undefined', () => {
    const messages = [makeMsg('m0', '2026-04-10T00:00:00.000Z')];
    const messageCommits = [{ message_uuid: 'm0' }];
    const result = computePromptToCommitSuccessRate({ messages, messageCommits }, range, prevRange, 'day');
    expect(result.level).toBeUndefined();
  });
});
