import type { SessionMapping } from '@anytime-markdown/agent-core';
import { SessionTreeItem, SourceGroupItem, TodaySummaryItem } from '../AgentMappingItem';

function makeSession(overrides: Partial<SessionMapping>): SessionMapping {
  return {
    sessionId: '019f01f5-83fc-7782-a37c-0a8daffe4404',
    source: 'claude',
    state: 'recent',
    editing: false,
    file: '/repo/a.ts',
    fileBasename: 'a.ts',
    timestamp: '2026-06-26T03:00:00.000Z',
    ageSeconds: 120,
    sessionEdits: [],
    plannedEdits: [],
    ...overrides,
  };
}

function iconId(item: { iconPath?: unknown }): string | undefined {
  return (item.iconPath as { id?: string } | undefined)?.id;
}

describe('SessionTreeItem', () => {
  it('Claude active session shows the green filled state icon and editing/session contextValue', () => {
    const item = new SessionTreeItem(makeSession({ source: 'claude', state: 'active' }));
    expect(iconId(item)).toBe('circle-filled');
    expect(item.contextValue).toBe('session.active');
    expect(String(item.description)).toContain('editing');
  });

  it('Codex session never uses the green active dot (uses robot icon) and is always idle', () => {
    const item = new SessionTreeItem(makeSession({ source: 'codex', state: 'active' }));
    // 緑(circle-filled)を使わない — age 由来 active=緑は「編集中」を誤示唆するため。
    expect(iconId(item)).toBe('robot');
    expect(String(item.description)).toContain('idle');
    expect(String(item.description)).not.toContain('editing');
  });

  it('Codex contextValue is codexSession (so handoff/delete are gated out, copy allowed)', () => {
    const item = new SessionTreeItem(makeSession({ source: 'codex', state: 'recent' }));
    expect(item.contextValue).toBe('codexSession');
  });

  it('Codex bloated context uses codexSession.bloated', () => {
    const item = new SessionTreeItem(makeSession({ source: 'codex', contextTokens: 200_000 }));
    expect(item.contextValue).toBe('codexSession.bloated');
    expect(String(item.description)).toContain('⚠️');
  });

  it('Codex tooltip states the read-only source', () => {
    const item = new SessionTreeItem(makeSession({ source: 'codex' }));
    expect((item.tooltip as { value: string }).value).toContain('Source:');
    expect((item.tooltip as { value: string }).value).toContain('Codex');
  });
});

describe('SourceGroupItem', () => {
  it('labels Codex group and exposes its children count', () => {
    const children = [new SessionTreeItem(makeSession({ source: 'codex' }))];
    const group = new SourceGroupItem('codex', children);
    expect(group.label).toBe('Codex');
    expect(group.description).toBe('1');
    expect(group.contextValue).toBe('sourceGroup.codex');
    expect(group.children).toHaveLength(1);
  });

  it('labels Claude group', () => {
    const group = new SourceGroupItem('claude', []);
    expect(group.label).toBe('Claude Code');
  });
});

describe('TodaySummaryItem', () => {
  it('is labeled Today (Claude) to disambiguate from Codex', () => {
    const item = new TodaySummaryItem({ sessionCount: 2, totalTokens: 0 }, 0);
    expect(item.label).toBe('Today (Claude)');
  });
});
