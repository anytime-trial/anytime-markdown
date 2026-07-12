import * as vscode from 'vscode';
import type { SessionMapping } from '@anytime-markdown/agent-core';
import {
  SessionTreeItem,
  SourceGroupItem,
  TodaySummaryItem,
  WorkspaceGroupItem,
  formatWorkspaceName,
} from '../AgentMappingItem';

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

  it('tooltip shows the workspace name (basename of workspacePath)', () => {
    const item = new SessionTreeItem(makeSession({ workspacePath: '/home/user/anytime-markdown' }));
    expect((item.tooltip as { value: string }).value).toContain('ワークスペース:');
    expect((item.tooltip as { value: string }).value).toContain('anytime-markdown');
  });

  it('tooltip omits the workspace line when workspacePath is absent', () => {
    const item = new SessionTreeItem(makeSession({ workspacePath: undefined }));
    expect((item.tooltip as { value: string }).value).not.toContain('ワークスペース:');
  });
});

describe('formatWorkspaceName', () => {
  it('returns the last path segment', () => {
    expect(formatWorkspaceName('/home/user/anytime-markdown')).toBe('anytime-markdown');
  });

  it('ignores a trailing separator', () => {
    expect(formatWorkspaceName('/home/user/anytime-markdown/')).toBe('anytime-markdown');
  });

  it('handles Windows-style separators', () => {
    expect(formatWorkspaceName('C:\\repos\\anytime-markdown')).toBe('anytime-markdown');
  });

  it('returns undefined for empty or missing input', () => {
    expect(formatWorkspaceName(undefined)).toBeUndefined();
    expect(formatWorkspaceName('')).toBeUndefined();
    expect(formatWorkspaceName('/')).toBeUndefined();
  });
});

describe('WorkspaceGroupItem', () => {
  function wsGroup(workspacePath: string, count: number): WorkspaceGroupItem {
    const sessions = Array.from({ length: count }, (_, i) =>
      new SessionTreeItem(makeSession({ sessionId: `session-${i}`, workspacePath })),
    );
    return new WorkspaceGroupItem(workspacePath, sessions);
  }

  it('is labeled with the workspace name and shows its session count', () => {
    const group = wsGroup('/home/user/anytime-markdown', 2);
    expect(group.label).toBe('anytime-markdown');
    expect(group.description).toBe('2');
    expect(group.contextValue).toBe('workspaceGroup');
    expect(group.children).toHaveLength(2);
  });

  it('exposes the full path in the tooltip (disambiguates same-named worktrees)', () => {
    const group = wsGroup('/home/user/anytime-markdown/.worktrees/feat', 1);
    expect(group.label).toBe('feat');
    expect((group.tooltip as { value: string }).value).toContain('/home/user/anytime-markdown/.worktrees/feat');
  });

  it('falls back to an explicit unknown label when the workspace path is empty', () => {
    const group = new WorkspaceGroupItem('', [new SessionTreeItem(makeSession({}))]);
    expect(group.label).toBe('(ワークスペース不明)');
  });
});

describe('SourceGroupItem', () => {
  function wsGroup(workspacePath: string, count: number): WorkspaceGroupItem {
    const sessions = Array.from({ length: count }, (_, i) =>
      new SessionTreeItem(makeSession({ sessionId: `session-${workspacePath}-${i}`, workspacePath })),
    );
    return new WorkspaceGroupItem(workspacePath, sessions);
  }

  it('labels Codex group and exposes its workspace children', () => {
    const group = new SourceGroupItem('codex', [wsGroup('/repo', 1)]);
    expect(group.label).toBe('Codex');
    expect(group.description).toBe('1');
    expect(group.contextValue).toBe('sourceGroup.codex');
    expect(group.children).toHaveLength(1);
  });

  it('counts sessions across all workspaces, not the number of workspaces', () => {
    const group = new SourceGroupItem('claude', [wsGroup('/repo-a', 2), wsGroup('/repo-b', 3)]);
    expect(group.children).toHaveLength(2);
    expect(group.description).toBe('5');
  });

  it('labels Claude group', () => {
    const group = new SourceGroupItem('claude', []);
    expect(group.label).toBe('Claude Code');
  });

  it('uses the bundled Claude SVG when an icon base URI is provided', () => {
    const claude = new SourceGroupItem('claude', [], vscode.Uri.file('/ext'));
    expect((claude.iconPath as { fsPath: string }).fsPath).toBe('/ext/images/icons/claude.svg');
  });

  it('uses a neutral codicon for Codex (no trademarked logo bundled)', () => {
    const codex = new SourceGroupItem('codex', [], vscode.Uri.file('/ext'));
    expect((codex.iconPath as { id?: string }).id).toBe('terminal');
  });

  it('falls back to a codicon for Claude when no icon base URI is given', () => {
    const group = new SourceGroupItem('claude', []);
    expect((group.iconPath as { id?: string }).id).toBe('account');
  });
});

describe('TodaySummaryItem', () => {
  it('is labeled Today (Claude) to disambiguate from Codex', () => {
    const item = new TodaySummaryItem({ sessionCount: 2, totalTokens: 0 }, 0);
    expect(item.label).toBe('Today (Claude)');
  });
});
