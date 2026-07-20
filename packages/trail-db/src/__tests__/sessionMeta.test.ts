import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractRepoNameFromJsonl, normalizeWorkspaceName } from '../sessionMeta';

function writeJsonl(lines: ReadonlyArray<object | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionMeta-test-'));
  const file = path.join(dir, 'session.jsonl');
  const content = lines
    .map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))
    .join('\n');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

describe('extractRepoNameFromJsonl', () => {
  it('returns basename of cwd from the first line that has it', () => {
    const file = writeJsonl([
      { type: 'last-prompt', sessionId: 'abc' },
      { type: 'user', cwd: '/anytime-trade', message: { content: 'hi' } },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });

  it('returns basename of cwd when cwd is on the first line', () => {
    const file = writeJsonl([
      { type: 'user', cwd: '/anytime-lab', message: { content: 'hi' } },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-lab');
  });

  it('returns null when the file is empty', () => {
    const file = writeJsonl([]);
    expect(extractRepoNameFromJsonl(file)).toBeNull();
  });

  it('returns null when no line contains cwd', () => {
    const file = writeJsonl([
      { type: 'last-prompt', sessionId: 'abc' },
      { type: 'response_item', payload: {} },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBeNull();
  });

  it('returns null when the file does not exist', () => {
    expect(extractRepoNameFromJsonl('/no/such/path.jsonl')).toBeNull();
  });

  it('skips malformed JSON lines and continues searching', () => {
    const file = writeJsonl([
      '{ this is not json',
      { type: 'user', cwd: '/anytime-trade' },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });

  it('takes basename for a deeply nested cwd', () => {
    const file = writeJsonl([{ type: 'user', cwd: '/workspaces/anytime-trade' }]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });

  it('takes basename for a home-rooted cwd', () => {
    const file = writeJsonl([{ type: 'user', cwd: '/home/ueda/Shared/tiptap' }]);
    expect(extractRepoNameFromJsonl(file)).toBe('tiptap');
  });

  it('collapses .worktrees/<name> into the parent repo name', () => {
    const file = writeJsonl([
      { type: 'user', cwd: '/anytime-markdown/.worktrees/feature-foo' },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-markdown');
  });

  it('collapses .claude-worktrees/<name> into the parent repo name', () => {
    const file = writeJsonl([
      { type: 'user', cwd: '/anytime-markdown/.claude-worktrees/refactor-bar' },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-markdown');
  });

  it('collapses .worktrees even when the worktree path is deeper', () => {
    const file = writeJsonl([
      { type: 'user', cwd: '/workspaces/anytime-trade/.worktrees/feature-x' },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });

  it('returns null for cwd of "/" only', () => {
    const file = writeJsonl([{ type: 'user', cwd: '/' }]);
    expect(extractRepoNameFromJsonl(file)).toBeNull();
  });

  it('returns null when cwd is an empty string', () => {
    const file = writeJsonl([{ type: 'user', cwd: '' }]);
    expect(extractRepoNameFromJsonl(file)).toBeNull();
  });

  it('ignores cwd values that are not strings', () => {
    const file = writeJsonl([
      { type: 'user', cwd: 12345 },
      { type: 'user', cwd: '/anytime-trade' },
    ]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });

  it('strips trailing slash before taking basename', () => {
    const file = writeJsonl([{ type: 'user', cwd: '/anytime-trade/' }]);
    expect(extractRepoNameFromJsonl(file)).toBe('anytime-trade');
  });
});

describe('extractRepoNameFromJsonl — git ルート解決', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionMeta-git-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeJsonlWithCwd(cwd: string): string {
    return writeJsonl([{ type: 'user', cwd }]);
  }

  it('attributes a subdirectory cwd to the enclosing git repository', () => {
    const repo = path.join(root, 'myrepo');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    const sub = path.join(repo, 'packages', 'web-app');
    fs.mkdirSync(sub, { recursive: true });
    expect(extractRepoNameFromJsonl(writeJsonlWithCwd(sub))).toBe('myrepo');
  });

  it('collapses a worktree checkout (.git file) into the parent repo', () => {
    const repo = path.join(root, 'myrepo');
    const wt = path.join(repo, '.worktrees', 'feature-foo');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.mkdirSync(wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /elsewhere\n', 'utf-8');
    expect(extractRepoNameFromJsonl(writeJsonlWithCwd(wt))).toBe('myrepo');
  });

  it('collapses a subdirectory inside a worktree into the parent repo', () => {
    const repo = path.join(root, 'myrepo');
    const wt = path.join(repo, '.worktrees', 'feature-foo');
    const sub = path.join(wt, 'scripts', 'vscode-extension');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /elsewhere\n', 'utf-8');
    expect(extractRepoNameFromJsonl(writeJsonlWithCwd(sub))).toBe('myrepo');
  });

  it('falls back to the cwd basename when the path no longer exists', () => {
    expect(extractRepoNameFromJsonl(writeJsonlWithCwd('/gone/anytime-trade'))).toBe('anytime-trade');
  });

  it('falls back to the cwd basename when no .git is found up the tree', () => {
    const plain = path.join(root, 'plain-dir');
    fs.mkdirSync(plain, { recursive: true });
    expect(extractRepoNameFromJsonl(writeJsonlWithCwd(plain))).toBe('plain-dir');
  });
});

describe('normalizeWorkspaceName', () => {
  it('returns plain repo names unchanged', () => {
    expect(normalizeWorkspaceName('anytime-markdown')).toBe('anytime-markdown');
  });

  it('strips --claude-worktrees- suffix to the parent repo name', () => {
    expect(
      normalizeWorkspaceName('anytime-markdown--claude-worktrees-recall-trial--recall-src-scripts'),
    ).toBe('anytime-markdown');
  });

  it('strips --worktrees- suffix to the parent repo name', () => {
    expect(normalizeWorkspaceName('anytime-trade--worktrees-term-help-tooltip')).toBe(
      'anytime-trade',
    );
  });

  it('keeps names where stripping would leave nothing', () => {
    expect(normalizeWorkspaceName('--worktrees-orphan')).toBe('--worktrees-orphan');
  });

  it('keeps empty string as-is', () => {
    expect(normalizeWorkspaceName('')).toBe('');
  });

  it('does not treat single-dash -worktrees- as a worktree suffix', () => {
    expect(normalizeWorkspaceName('repo-worktrees-history')).toBe('repo-worktrees-history');
  });
});
