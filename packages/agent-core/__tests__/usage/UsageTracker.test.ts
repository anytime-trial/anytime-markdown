import { UsageTracker } from '../../src/usage/UsageTracker';
import type { ThresholdEvent } from '../../src/usage/types';

describe('UsageTracker', () => {
  describe('record', () => {
    it('creates a new record on first call', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      t.record('ollama', 'llama3', 100, 50);
      const snap = t.getSnapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0]).toMatchObject({
        providerId: 'ollama',
        model: 'llama3',
        inputTokens: 100,
        outputTokens: 50,
        callCount: 1,
        periodStart: '2026-05-16T00:00:00.000Z',
        lastUpdatedAt: '2026-05-16T00:00:00.000Z',
      });
    });

    it('aggregates tokens and increments callCount on subsequent calls', () => {
      let i = 0;
      const t = new UsageTracker(() => {
        i += 1;
        return `2026-05-16T00:00:0${i}.000Z`;
      });
      t.record('ollama', 'llama3', 100, 50);
      t.record('ollama', 'llama3', 30, 20);
      const snap = t.getSnapshot();
      expect(snap[0]).toMatchObject({
        inputTokens: 130,
        outputTokens: 70,
        callCount: 2,
        periodStart: '2026-05-16T00:00:01.000Z',
        lastUpdatedAt: '2026-05-16T00:00:02.000Z',
      });
    });

    it('keeps separate records per model', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      t.record('ollama', 'llama3', 10, 10);
      t.record('ollama', 'qwen', 20, 20);
      expect(t.getSnapshot()).toHaveLength(2);
    });

    it('rejects negative token counts', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      expect(() => t.record('p', 'm', -1, 0)).toThrow(/non-negative/);
      expect(() => t.record('p', 'm', 0, -1)).toThrow(/non-negative/);
    });
  });

  describe('getSnapshot', () => {
    it('filters by providerId', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      t.record('ollama', 'm', 1, 1);
      t.record('claude', 'm', 1, 1);
      expect(t.getSnapshot({ providerId: 'ollama' })).toHaveLength(1);
      expect(t.getSnapshot({ providerId: 'claude' })[0].providerId).toBe('claude');
    });

    it('filters by sinceIso (lastUpdatedAt >= sinceIso)', () => {
      let i = 0;
      const stamps = [
        '2026-05-16T00:00:00.000Z',
        '2026-05-16T00:00:05.000Z',
        '2026-05-16T00:00:10.000Z',
      ];
      const t = new UsageTracker(() => stamps[i++]);
      t.record('a', 'm', 1, 1);
      t.record('b', 'm', 1, 1);
      t.record('c', 'm', 1, 1);
      const snap = t.getSnapshot({ sinceIso: '2026-05-16T00:00:05.000Z' });
      expect(snap.map((r) => r.providerId).sort()).toEqual(['b', 'c']);
    });
  });

  describe('setThreshold', () => {
    it('fires once when total tokens for providerId crosses threshold', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      const events: ThresholdEvent[] = [];
      t.onThresholdExceeded((e) => events.push(e));
      t.setThreshold('ollama', 100);

      t.record('ollama', 'm', 30, 30);   // total 60, below
      t.record('ollama', 'm', 30, 30);   // total 120, fires
      t.record('ollama', 'm', 50, 50);   // total 220, no refire

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ providerId: 'ollama', totalTokens: 120, threshold: 100 });
    });

    it('counts across all models for a provider', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      const events: ThresholdEvent[] = [];
      t.onThresholdExceeded((e) => events.push(e));
      t.setThreshold('ollama', 50);

      t.record('ollama', 'a', 20, 0);    // 20
      t.record('ollama', 'b', 20, 0);    // 40
      t.record('ollama', 'c', 20, 0);    // 60, fires

      expect(events).toHaveLength(1);
      expect(events[0].totalTokens).toBe(60);
    });

    it('rejects non-positive threshold', () => {
      const t = new UsageTracker();
      expect(() => t.setThreshold('p', 0)).toThrow(/> 0/);
    });

    it('resets the fired flag when setThreshold is called again', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      const events: ThresholdEvent[] = [];
      t.onThresholdExceeded((e) => events.push(e));
      t.setThreshold('ollama', 10);
      t.record('ollama', 'm', 20, 0); // fires
      t.setThreshold('ollama', 100);  // raise threshold, clears fired flag
      t.record('ollama', 'm', 100, 0); // total 120, fires again
      expect(events).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('clears all records when no providerId is given', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      t.record('a', 'm', 1, 1);
      t.record('b', 'm', 1, 1);
      t.reset();
      expect(t.getSnapshot()).toHaveLength(0);
    });

    it('clears only the given providerId', () => {
      const t = new UsageTracker(() => '2026-05-16T00:00:00.000Z');
      t.record('a', 'm', 1, 1);
      t.record('b', 'm', 1, 1);
      t.reset('a');
      const remaining = t.getSnapshot();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].providerId).toBe('b');
    });
  });
});
