/**
 * rootComponentsA — FilterBar / StatsBar / SessionList / shared skeleton の vanilla view テスト。
 *
 * jsdom 環境。DOM 構築・インタラクション・update/destroy のクリーンアップを検証する。
 */

import { mountFilterBar, type FilterBarProps } from '../filterBar';
import { mountStatsBar, type StatsBarProps } from '../statsBar';
import { mountSessionList, type SessionListProps } from '../sessionList';
import { mountAnalyticsPanelSkeleton } from '../shared/analyticsPanelSkeleton';
import { mountC4PanelSkeleton } from '../shared/c4PanelSkeleton';
import { mountTabSkeleton } from '../shared/tabSkeleton';
import type { TrailFilter, TrailSession } from '../../domain/parser/types';

// ── helpers ────────────────────────────────────────────────────────────────

const t = (key: string): string => key;

const darkColors = {
  midnightNavy: '#0D1117',
  charcoal: '#121212',
  border: 'rgba(255,255,255,0.12)',
  textSecondary: 'rgba(255,255,255,0.70)',
  iceBlue: '#90CAF9',
  error: '#EF5350',
  success: '#66BB6A',
};

function makeFilter(over: Partial<TrailFilter> = {}): TrailFilter {
  return { searchText: undefined, workspace: undefined, ...over };
}

function makeSession(over: Partial<TrailSession> = {}): TrailSession {
  return {
    id: 'session-abc123',
    slug: 'my-feature',
    repoName: 'anytime-markdown',
    gitBranch: 'feature/x',
    startTime: '2026-06-21T00:00:00.000Z',
    endTime: '2026-06-21T01:00:00.000Z',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    messageCount: 42,
    source: 'claude_code',
    errorCount: 0,
    subAgentCount: 0,
    workspace: '/home/user/project',
    usage: {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheCreationTokens: 100,
    },
    ...over,
  };
}

// ── FilterBar ───────────────────────────────────────────────────────────────

describe('mountFilterBar', () => {
  function baseProps(over: Partial<FilterBarProps> = {}): FilterBarProps {
    return {
      t,
      filter: makeFilter(),
      sessions: [],
      onChange: () => {},
      colors: {
        midnightNavy: darkColors.midnightNavy,
        border: darkColors.border,
        textSecondary: darkColors.textSecondary,
      },
      ...over,
    };
  }

  it('ツールバーを DOM にマウントする', () => {
    const c = document.createElement('div');
    mountFilterBar(c, baseProps());
    expect(c.children.length).toBeGreaterThan(0);
  });

  it('destroy で DOM を撤去する', () => {
    const c = document.createElement('div');
    const h = mountFilterBar(c, baseProps());
    h.destroy();
    expect(c.children.length).toBe(0);
  });

  it('searchText があれば onChange を onChange で反映できる', () => {
    const changes: TrailFilter[] = [];
    const c = document.createElement('div');
    const h = mountFilterBar(c, baseProps({ onChange: (f) => changes.push(f) }));
    // update してクリアボタン表示確認
    h.update(baseProps({ filter: makeFilter({ searchText: 'hello' }) }));
    expect(c.querySelector('button[aria-label="filter.searchClear"]')).not.toBeNull();
    h.destroy();
  });

  it('workspace セッションから選択肢を構築する', () => {
    const sessions = [makeSession({ workspace: '/proj/a' }), makeSession({ workspace: '/proj/b' })];
    const c = document.createElement('div');
    const h = mountFilterBar(c, baseProps({ sessions }));
    // Select button (combobox) should exist
    const combobox = c.querySelector('[role="combobox"]');
    expect(combobox).not.toBeNull();
    h.destroy();
  });
});

// ── StatsBar ────────────────────────────────────────────────────────────────

describe('mountStatsBar', () => {
  function baseProps(over: Partial<StatsBarProps> = {}): StatsBarProps {
    return {
      t,
      session: undefined,
      messages: [],
      colors: darkColors,
      ...over,
    };
  }

  it('session がなければ noSessionSelected を表示する', () => {
    const c = document.createElement('div');
    mountStatsBar(c, baseProps());
    expect(c.textContent).toContain('stats.noSessionSelected');
  });

  it('session があればトークン chip を表示する', () => {
    const c = document.createElement('div');
    const session = makeSession();
    mountStatsBar(c, baseProps({ session, messages: [] }));
    expect(c.textContent).toContain('stats.input');
    expect(c.textContent).toContain('stats.output');
    expect(c.textContent).toContain('stats.cacheRead');
    expect(c.textContent).toContain('stats.duration');
  });

  it('update で session 切替を反映する', () => {
    const c = document.createElement('div');
    const h = mountStatsBar(c, baseProps());
    expect(c.textContent).toContain('stats.noSessionSelected');

    h.update(baseProps({ session: makeSession(), messages: [] }));
    expect(c.textContent).not.toContain('stats.noSessionSelected');
    expect(c.textContent).toContain('stats.input');

    h.destroy();
    expect(c.children.length).toBe(0);
  });

  it('destroy で DOM を撤去する', () => {
    const c = document.createElement('div');
    const h = mountStatsBar(c, baseProps({ session: makeSession() }));
    h.destroy();
    expect(c.children.length).toBe(0);
  });
});

// ── SessionList ─────────────────────────────────────────────────────────────

describe('mountSessionList', () => {
  function baseProps(over: Partial<SessionListProps> = {}): SessionListProps {
    return {
      t,
      sessions: [],
      selectedId: undefined,
      onSelect: () => {},
      colors: { textSecondary: darkColors.textSecondary, iceBlue: darkColors.iceBlue },
      ...over,
    };
  }

  it('sessions が空なら noSessions を表示する', () => {
    const c = document.createElement('div');
    mountSessionList(c, baseProps());
    expect(c.textContent).toContain('sessionList.noSessions');
  });

  it('sessions があれば行を描画する', () => {
    const c = document.createElement('div');
    mountSessionList(c, baseProps({ sessions: [makeSession()] }));
    const rows = c.querySelectorAll('[data-testid="session-row"]');
    expect(rows.length).toBe(1);
  });

  it('行クリックで onSelect を呼ぶ', () => {
    const selected: string[] = [];
    const c = document.createElement('div');
    const session = makeSession();
    mountSessionList(
      c,
      baseProps({ sessions: [session], onSelect: (id) => selected.push(id) }),
    );
    const row = c.querySelector('[data-testid="session-row"]') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(selected).toContain(session.id);
  });

  it('selectedId に一致する行が selected 状態になる', () => {
    const c = document.createElement('div');
    const session = makeSession({ id: 'test-id-xyz' });
    mountSessionList(c, baseProps({ sessions: [session], selectedId: 'test-id-xyz' }));
    const row = c.querySelector('[aria-selected="true"]') as HTMLElement;
    expect(row).not.toBeNull();
  });

  it('update でセッション一覧を更新する', () => {
    const c = document.createElement('div');
    const h = mountSessionList(c, baseProps({ sessions: [makeSession()] }));
    expect(c.querySelectorAll('[data-testid="session-row"]').length).toBe(1);

    h.update(
      baseProps({
        sessions: [makeSession({ id: 'a' }), makeSession({ id: 'b' })],
      }),
    );
    expect(c.querySelectorAll('[data-testid="session-row"]').length).toBe(2);

    h.destroy();
  });

  it('destroy でリスナー・DOM をクリーンアップする', () => {
    const c = document.createElement('div');
    const h = mountSessionList(c, baseProps({ sessions: [makeSession()] }));
    h.destroy();
    expect(c.children.length).toBe(0);
  });
});

// ── Skeleton factories ───────────────────────────────────────────────────────

describe('mountAnalyticsPanelSkeleton', () => {
  it('DOM をマウントし el を返す', () => {
    const c = document.createElement('div');
    const { el } = mountAnalyticsPanelSkeleton(c);
    expect(el).toBeTruthy();
    expect(c.contains(el)).toBe(true);
  });
});

describe('mountC4PanelSkeleton', () => {
  it('DOM をマウントし el を返す', () => {
    const c = document.createElement('div');
    const { el } = mountC4PanelSkeleton(c);
    expect(el).toBeTruthy();
    expect(c.contains(el)).toBe(true);
  });
});

describe('mountTabSkeleton', () => {
  it('DOM をマウントし el を返す', () => {
    const c = document.createElement('div');
    const { el } = mountTabSkeleton(c, { height: '50vh' });
    expect(el).toBeTruthy();
    expect(el.style.height).toBe('50vh');
    expect(c.contains(el)).toBe(true);
  });

  it('height 省略時は 70vh', () => {
    const c = document.createElement('div');
    const { el } = mountTabSkeleton(c);
    expect(el.style.height).toBe('70vh');
  });
});
