import {
  getStatusLabel,
  getStatusIcon,
  getStatusColor,
  ChangesRepoItem,
  ChangesGroupItem,
  ChangesFileItem,
  ChangesSyncItem,
} from '../types';

// GitStatus const enum values (inlined since const enum is erased at compile time)
const GitStatus = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
} as const;

describe('getStatusLabel', () => {
  describe('staged group', () => {
    it('returns M for INDEX_MODIFIED', () => {
      expect(getStatusLabel(GitStatus.INDEX_MODIFIED, 'staged')).toBe('M');
    });
    it('returns A for INDEX_ADDED', () => {
      expect(getStatusLabel(GitStatus.INDEX_ADDED, 'staged')).toBe('A');
    });
    it('returns D for INDEX_DELETED', () => {
      expect(getStatusLabel(GitStatus.INDEX_DELETED, 'staged')).toBe('D');
    });
    it('returns R for INDEX_RENAMED', () => {
      expect(getStatusLabel(GitStatus.INDEX_RENAMED, 'staged')).toBe('R');
    });
    it('returns M for unknown status', () => {
      expect(getStatusLabel(99, 'staged')).toBe('M');
    });
  });

  describe('changes group', () => {
    it('returns M for MODIFIED', () => {
      expect(getStatusLabel(GitStatus.MODIFIED, 'changes')).toBe('M');
    });
    it('returns D for DELETED', () => {
      expect(getStatusLabel(GitStatus.DELETED, 'changes')).toBe('D');
    });
    it('returns U for UNTRACKED', () => {
      expect(getStatusLabel(GitStatus.UNTRACKED, 'changes')).toBe('U');
    });
    it('returns M for unknown status', () => {
      expect(getStatusLabel(99, 'changes')).toBe('M');
    });
  });
});

describe('getStatusIcon', () => {
  it('returns diff-added for UNTRACKED in changes', () => {
    expect(getStatusIcon(GitStatus.UNTRACKED, 'changes')).toBe('diff-added');
  });
  it('returns diff-removed for DELETED in changes', () => {
    expect(getStatusIcon(GitStatus.DELETED, 'changes')).toBe('diff-removed');
  });
  it('returns diff-added for INDEX_ADDED in staged', () => {
    expect(getStatusIcon(GitStatus.INDEX_ADDED, 'staged')).toBe('diff-added');
  });
  it('returns diff-removed for INDEX_DELETED in staged', () => {
    expect(getStatusIcon(GitStatus.INDEX_DELETED, 'staged')).toBe('diff-removed');
  });
  it('returns diff-modified for MODIFIED in changes', () => {
    expect(getStatusIcon(GitStatus.MODIFIED, 'changes')).toBe('diff-modified');
  });
  it('returns diff-modified for INDEX_MODIFIED in staged', () => {
    expect(getStatusIcon(GitStatus.INDEX_MODIFIED, 'staged')).toBe('diff-modified');
  });
});

describe('getStatusColor', () => {
  it('returns untrackedResourceForeground for UNTRACKED in changes', () => {
    const color = getStatusColor(GitStatus.UNTRACKED, 'changes');
    expect(color).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.untrackedResourceForeground');
  });
  it('returns deletedResourceForeground for DELETED in changes', () => {
    const color = getStatusColor(GitStatus.DELETED, 'changes');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.deletedResourceForeground');
  });
  it('returns addedResourceForeground for INDEX_ADDED in staged', () => {
    const color = getStatusColor(GitStatus.INDEX_ADDED, 'staged');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.addedResourceForeground');
  });
  it('returns deletedResourceForeground for INDEX_DELETED in staged', () => {
    const color = getStatusColor(GitStatus.INDEX_DELETED, 'staged');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.deletedResourceForeground');
  });
  it('returns modifiedResourceForeground for MODIFIED in changes', () => {
    const color = getStatusColor(GitStatus.MODIFIED, 'changes');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.modifiedResourceForeground');
  });
  it('returns modifiedResourceForeground for INDEX_MODIFIED in staged', () => {
    const color = getStatusColor(GitStatus.INDEX_MODIFIED, 'staged');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((color as any).id).toBe('gitDecoration.modifiedResourceForeground');
  });
});

describe('ChangesRepoItem', () => {
  it('creates item with branch name', () => {
    const item = new ChangesRepoItem('/repo', 'my-repo', 'main');
    expect(item.label).toBe('my-repo / main');
    expect(item.contextValue).toBe('changesRepo');
    expect(item.gitRoot).toBe('/repo');
  });

  it('creates item without branch name', () => {
    const item = new ChangesRepoItem('/repo', 'my-repo', '');
    expect(item.label).toBe('my-repo');
  });
});

describe('ChangesSyncItem', () => {
  it('shows ahead count', () => {
    const item = new ChangesSyncItem(3, 0, '/repo');
    expect(item.label).toBe('Sync Changes (3↑)');
    expect(item.contextValue).toBe('changesSync');
  });

  it('shows behind count', () => {
    const item = new ChangesSyncItem(0, 2, '/repo');
    expect(item.label).toBe('Sync Changes (2↓)');
  });

  it('shows both ahead and behind', () => {
    const item = new ChangesSyncItem(1, 4, '/repo');
    expect(item.label).toBe('Sync Changes (1↑ 4↓)');
  });

  it('shows neither when both zero', () => {
    const item = new ChangesSyncItem(0, 0, '/repo');
    expect(item.label).toBe('Sync Changes ()');
  });

  it('sets command with gitRoot argument', () => {
    const item = new ChangesSyncItem(1, 0, '/my-git-root');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((item.command as any)?.arguments?.[0]).toBe('/my-git-root');
  });
});

describe('ChangesGroupItem', () => {
  it('creates staged group with correct label', () => {
    const item = new ChangesGroupItem('staged', 5, '/repo');
    expect(item.label).toBe('Staged Changes');
    expect(item.description).toBe('5');
    expect(item.contextValue).toBe('changesGroupStaged');
  });

  it('creates changes group with correct label', () => {
    const item = new ChangesGroupItem('changes', 3, '/repo');
    expect(item.label).toBe('Changes');
    expect(item.description).toBe('3');
    expect(item.contextValue).toBe('changesGroupChanges');
  });
});

describe('ChangesFileItem', () => {
  const makeChange = (filePath: string, status: number, group: 'staged' | 'changes') => ({
    filePath,
    absPath: `/repo/${filePath}`,
    status,
    group,
  });

  it('creates file item for staged modified file', () => {
    const change = makeChange('src/file.ts', GitStatus.INDEX_MODIFIED, 'staged');
    const item = new ChangesFileItem(change, '/repo');
    expect(item.label).toBe('file.ts');
    expect(item.filePath).toBe('src/file.ts');
    expect(item.group).toBe('staged');
    expect(item.contextValue).toBe('changesFileStaged');
  });

  it('creates file item for unstaged file in root dir', () => {
    const change = makeChange('README.md', GitStatus.MODIFIED, 'changes');
    const item = new ChangesFileItem(change, '/repo');
    expect(item.label).toBe('README.md');
    // dir is '.', so description should just be status label
    expect(item.description).toBe('M');
    expect(item.contextValue).toBe('changesFileUnstaged');
  });

  it('sets description with dir for nested file', () => {
    const change = makeChange('src/utils/helper.ts', GitStatus.MODIFIED, 'changes');
    const item = new ChangesFileItem(change, '/repo');
    expect(item.description).toContain('src/utils');
    expect(item.description).toContain('M');
  });

  it('sets open command for markdown files', () => {
    const change = makeChange('docs/guide.md', GitStatus.INDEX_ADDED, 'staged');
    const item = new ChangesFileItem(change, '/repo');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((item.command as any)?.command).toBe('anytime-history.changesOpenFile');
  });

  it('sets open command for non-markdown files', () => {
    const change = makeChange('src/index.ts', GitStatus.UNTRACKED, 'changes');
    const item = new ChangesFileItem(change, '/repo');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((item.command as any)?.command).toBe('anytime-history.changesOpenFile');
  });

  it('marks markdown file correctly in command args', () => {
    const change = makeChange('README.markdown', GitStatus.MODIFIED, 'changes');
    const item = new ChangesFileItem(change, '/repo');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (item.command as any)?.arguments;
    expect(args?.[4]).toBe(true); // isMd
  });
});
