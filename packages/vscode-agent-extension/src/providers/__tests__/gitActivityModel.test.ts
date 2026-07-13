import type { GitActivityRow, GitAttribution, WorkSnapshot } from '@anytime-markdown/agent-core';
import { applyFilters, buildTimeline, groupByLocalDate, recoveryCommand } from '../gitActivityModel';

function gitRow(overrides: Partial<GitActivityRow>): GitActivityRow {
  return {
    id: 1,
    workspacePath: '/repo',
    opType: 'reset',
    destructive: true,
    refName: 'main',
    beforeSha: '1234567890abcdef1234567890abcdef12345678',
    afterSha: 'abcdef1234567890abcdef1234567890abcdef12',
    attribution: 'human',
    agentKind: null,
    sessionId: null,
    occurredAt: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<WorkSnapshot>): WorkSnapshot {
  return {
    ref: 'refs/anytime/snapshots/repo-123456/20260713T120000Z',
    sha: 'fedcba9876543210fedcba9876543210fedcba98',
    tree: '9876543210abcdef9876543210abcdef98765432',
    createdAt: '2026-07-13T12:00:00.000Z',
    fileCount: 3,
    ...overrides,
  };
}

describe('buildTimeline', () => {
  it('mixes git activity and snapshots in descending time order', () => {
    const rows = [
      gitRow({ id: 1, occurredAt: '2026-07-13T10:00:00.000Z' }),
      gitRow({ id: 2, occurredAt: '2026-07-13T08:00:00.000Z' }),
    ];
    const snapshots = [
      snapshot({ ref: 'snapshot-newer', createdAt: '2026-07-13T11:00:00.000Z' }),
      snapshot({ ref: 'snapshot-middle', createdAt: '2026-07-13T09:00:00.000Z' }),
    ];

    expect(buildTimeline(rows, snapshots).map((entry) => entry.at)).toEqual([
      '2026-07-13T11:00:00.000Z',
      '2026-07-13T10:00:00.000Z',
      '2026-07-13T09:00:00.000Z',
      '2026-07-13T08:00:00.000Z',
    ]);
    expect(buildTimeline(rows, snapshots).map((entry) => entry.kind)).toEqual([
      'snapshot',
      'git',
      'snapshot',
      'git',
    ]);
  });
});

describe('applyFilters', () => {
  it('removes non-destructive git activity for destructiveOnly=true but keeps snapshots', () => {
    const entries = buildTimeline(
      [
        gitRow({ id: 1, destructive: true, occurredAt: '2026-07-13T12:00:00.000Z' }),
        gitRow({ id: 2, destructive: false, occurredAt: '2026-07-13T11:00:00.000Z' }),
      ],
      [snapshot({ createdAt: '2026-07-13T10:00:00.000Z' })],
    );

    expect(
      applyFilters(
        entries,
        { destructiveOnly: true, attribution: 'all', days: null },
        '2026-07-13T12:00:00.000Z',
      ).map((entry) => entry.kind === 'git' ? `git:${entry.row.id}` : 'snapshot'),
    ).toEqual(['git:1', 'snapshot']);
  });

  it("removes non-matching git attribution for attribution='human' but keeps snapshots", () => {
    const entries = buildTimeline(
      [
        gitRow({ id: 1, attribution: 'human', occurredAt: '2026-07-13T12:00:00.000Z' }),
        gitRow({ id: 2, attribution: 'claude', occurredAt: '2026-07-13T11:00:00.000Z' }),
      ],
      [snapshot({ createdAt: '2026-07-13T10:00:00.000Z' })],
    );

    expect(
      applyFilters(
        entries,
        { destructiveOnly: false, attribution: 'human', days: null },
        '2026-07-13T12:00:00.000Z',
      ).map((entry) => entry.kind === 'git' ? `git:${entry.row.attribution}` : 'snapshot'),
    ).toEqual(['git:human', 'snapshot']);
  });

  it('removes entries older than the requested day window', () => {
    const entries = buildTimeline(
      [
        gitRow({ id: 1, occurredAt: '2026-07-07T00:00:00.000Z' }),
        gitRow({ id: 2, occurredAt: '2026-07-05T00:00:00.000Z' }),
      ],
      [],
    );

    expect(
      applyFilters(
        entries,
        { destructiveOnly: false, attribution: 'all', days: 7 },
        '2026-07-13T00:00:00.000Z',
      ).map((entry) => entry.kind === 'git' ? entry.row.id : entry.kind),
    ).toEqual([1]);
  });
});

describe('groupByLocalDate', () => {
  it("groups by the requested local date in Asia/Tokyo instead of UTC date", () => {
    const entries = buildTimeline(
      [
        gitRow({ id: 1, occurredAt: '2026-07-13T15:30:00.000Z' }),
        gitRow({ id: 2, occurredAt: '2026-07-13T12:00:00.000Z' }),
      ],
      [],
    );

    expect(groupByLocalDate(entries, 'Asia/Tokyo')).toEqual([
      {
        dateKey: '2026-07-14',
        entries: [entries[0]],
      },
      {
        dateKey: '2026-07-13',
        entries: [entries[1]],
      },
    ]);
  });
});

describe('recoveryCommand', () => {
  it('returns null for non-destructive activity', () => {
    expect(recoveryCommand(gitRow({ destructive: false }))).toBeNull();
  });

  it('returns null for destructive activity without beforeSha', () => {
    expect(recoveryCommand(gitRow({ destructive: true, beforeSha: null }))).toBeNull();
  });

  it('returns a non-destructive branch recovery command and never suggests git reset', () => {
    const beforeSha = '1234567890abcdef1234567890abcdef12345678';
    const command = recoveryCommand(gitRow({ destructive: true, beforeSha }));

    expect(command).toBe('git switch -c recover-1234567 1234567890abcdef1234567890abcdef12345678');
    expect(command).not.toContain('git reset');
  });
});

describe('TimelineFilters attribution type', () => {
  it('accepts all concrete attribution values through the imported GitAttribution type', () => {
    const values: readonly GitAttribution[] = ['claude', 'agent', 'human'];
    expect(values).toHaveLength(3);
  });
});
