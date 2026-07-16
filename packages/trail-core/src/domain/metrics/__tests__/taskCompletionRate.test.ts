import { computeTaskCompletionRate } from '../taskCompletionRate';
import type { TicketInput } from '../taskCompletionRate';
import type { DateRange } from '../types';

const RANGE: DateRange = {
  from: '2026-04-20T00:00:00.000Z',
  to: '2026-04-26T23:59:59.999Z',
};

const PREV_RANGE: DateRange = {
  from: '2026-04-13T00:00:00.000Z',
  to: '2026-04-19T23:59:59.999Z',
};

function ticket(assignee: string | undefined, status: string, updatedAt: string): TicketInput {
  return { assignee, status, updated_at: updatedAt };
}

describe('computeTaskCompletionRate', () => {
  it('computes completed share among attempted agent tickets', () => {
    const result = computeTaskCompletionRate(
      {
        tickets: [
          ticket('agent', 'completed', '2026-04-21T10:00:00.000Z'),
          ticket('agent', 'completed', '2026-04-22T10:00:00.000Z'),
          ticket('agent', 'in_progress', '2026-04-23T10:00:00.000Z'),
          ticket('agent', 'in_review', '2026-04-24T10:00:00.000Z'),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.value).toBe(50);
    expect(result.sampleSize).toBe(4);
    expect(result.unit).toBe('percent');
    expect(result.level).toBe('medium'); // 50% >= medium(50)
  });

  it('excludes non-agent assignees and non-attempted statuses', () => {
    const result = computeTaskCompletionRate(
      {
        tickets: [
          ticket('user', 'completed', '2026-04-21T10:00:00.000Z'),
          ticket(undefined, 'completed', '2026-04-21T11:00:00.000Z'),
          ticket('agent', 'backlog', '2026-04-21T12:00:00.000Z'),
          ticket('agent', 'up_next', '2026-04-21T13:00:00.000Z'),
          ticket('agent', 'completed', '2026-04-21T14:00:00.000Z'),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBe(100);
  });

  it('excludes tickets updated outside the range', () => {
    const result = computeTaskCompletionRate(
      {
        tickets: [
          ticket('agent', 'completed', '2026-04-19T10:00:00.000Z'),
          ticket('agent', 'completed', '2026-04-27T10:00:00.000Z'),
        ],
      },
      RANGE,
      PREV_RANGE,
      'day',
    );
    expect(result.sampleSize).toBe(0);
    expect(result.value).toBe(0);
    expect(result.level).toBeUndefined();
  });

  it('returns zero without level for empty tickets', () => {
    const result = computeTaskCompletionRate({ tickets: [] }, RANGE, PREV_RANGE, 'day');
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.level).toBeUndefined();
  });

  it('returns comparison against previous inputs (same array, previous range)', () => {
    const tickets = [
      ticket('agent', 'completed', '2026-04-21T10:00:00.000Z'),
      ticket('agent', 'in_progress', '2026-04-22T10:00:00.000Z'), // current: 50%
      ticket('agent', 'completed', '2026-04-14T10:00:00.000Z'),   // previous: 100%
    ];
    const result = computeTaskCompletionRate(
      { tickets },
      RANGE,
      PREV_RANGE,
      'day',
      { tickets },
    );
    expect(result.value).toBe(50);
    expect(result.comparison?.previousValue).toBe(100);
    expect(result.comparison?.deltaPct).toBe(-50);
  });
});
