// activity_user_feedback_entries は Flight Record 移設（2026-08-07・caravan-book.db 行き）の対象外で
// activity.db / TrailDatabase 側に残る。旧 TrailDatabase.flightReview.test.ts の S2 ブロックに
// 同居していた本テストは、移設で宙に浮かないよう TrailDatabase スコープへ分離した。

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

describe('TrailDatabase user feedback (activity_user_feedback_entries)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('user feedback は内容キーで冪等（再送で重複しない。FR-9）', () => {
    const input = {
      sessionId: 'sess-1',
      occurredAt: '2026-07-17T10:00:00.000Z',
      promptExcerpt: 'A ではなく B で実装して',
      matchedPattern: 'ではなく',
    };
    db.recordUserFeedbackEntry(input);
    db.recordUserFeedbackEntry(input);
    db.recordUserFeedbackEntry({ ...input, occurredAt: '2026-07-17T11:00:00.000Z' });

    const entries = db.listUserFeedbackEntries({ sessionId: 'sess-1' });
    expect(entries).toHaveLength(2);
    // occurred_at 降順
    expect(entries[0]?.occurredAt).toBe('2026-07-17T11:00:00.000Z');
  });
});
