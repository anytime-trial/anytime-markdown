import type { WorkSnapshot } from '@anytime-markdown/agent-core';

import { buildSnapshotPickItems } from '../workSnapshotPickModel';

function snapshot(overrides: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    ref: 'refs/anytime/snapshots/anytime-markdown-1a2b3c/20260713T050000Z',
    sha: '0123456789abcdef0123456789abcdef01234567',
    tree: 'fedcba9876543210fedcba9876543210fedcba98',
    createdAt: '2026-07-13T05:00:00.000Z',
    fileCount: 3,
    ...overrides,
  } as WorkSnapshot;
}

describe('buildSnapshotPickItems', () => {
  it('正常な日時はローカル TZ の表示ラベルになる', () => {
    const [item] = buildSnapshotPickItems([snapshot()]);
    expect(typeof item.label).toBe('string');
    expect(item.label).not.toBe('');
    expect(item.detail).toBe('0123456789ab');
    expect(item.description).toBe('3 files');
  });

  // 回帰: formatLocalDateTime は解釈できない日時に null を返す。それをそのまま
  // QuickPickItem.label（string 必須）へ渡していたため、破損した 1 件で行が選べなくなっていた。
  it('解釈できない日時でも label は必ず string になる（null を漏らさない）', () => {
    const items = buildSnapshotPickItems([
      snapshot({ createdAt: 'not-a-date' }),
      snapshot({ createdAt: '' }),
    ]);

    for (const item of items) {
      expect(typeof item.label).toBe('string');
      expect(item.label).toBe('時刻不明');
    }
  });

  it('破損した 1 件があっても他の件のラベルは失われない', () => {
    const items = buildSnapshotPickItems([
      snapshot({ createdAt: 'not-a-date', sha: 'aaaaaaaaaaaa0000' }),
      snapshot({ createdAt: '2026-07-13T05:00:00.000Z', sha: 'bbbbbbbbbbbb0000' }),
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].label).toBe('時刻不明');
    expect(items[1].label).not.toBe('時刻不明');
    expect(items.every((i) => typeof i.label === 'string')).toBe(true);
  });

  it('スナップショットが空なら空配列', () => {
    expect(buildSnapshotPickItems([])).toEqual([]);
  });
});
