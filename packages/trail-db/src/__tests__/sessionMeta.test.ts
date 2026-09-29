import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractRepoNameFromJsonl,
  extractRepoNameFromProjectDirPath,
  normalizeWorkspaceName,
  resolveCodexRepoName,
  readCodexSessionCwd,
  deriveRepoNameFromCwd,
  CODEX_UNKNOWN_REPO_NAME,
} from '../sessionMeta';

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

describe('extractRepoNameFromProjectDirPath', () => {
  const fileFor = (dirName: string): string => `/home/u/.claude/projects/${dirName}/sid.jsonl`;
  const existsIn = (paths: readonly string[]) => (p: string): boolean => paths.includes(p);

  it('recovers the repository from a flattened projects dir name', () => {
    const exists = existsIn([
      '/anytime-markdown',
      '/anytime-markdown/.git',
      '/anytime-markdown/packages',
      '/anytime-markdown/packages/web-app',
    ]);
    expect(
      extractRepoNameFromProjectDirPath(fileFor('-anytime-markdown-packages-web-app'), exists),
    ).toBe('anytime-markdown');
  });

  it('returns null when no split of the name exists on disk', () => {
    expect(
      extractRepoNameFromProjectDirPath(fileFor('-no-such-path'), existsIn([])),
    ).toBeNull();
  });

  it('returns null when more than one split resolves (ambiguous)', () => {
    const exists = existsIn([
      '/a',
      '/a/b-c',
      '/a/b',
      '/a/b/c',
    ]);
    expect(extractRepoNameFromProjectDirPath(fileFor('-a-b-c'), exists)).toBeNull();
  });

  it('gives up on names with too many segments to search', () => {
    const dirName = `-${Array.from({ length: 20 }, (_, i) => `t${i}`).join('-')}`;
    const probe = jest.fn(() => true);
    expect(extractRepoNameFromProjectDirPath(fileFor(dirName), probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('gives up when the probe limit truncates the search, even with exactly one candidate found', () => {
    // `/a/b` を見つけた直後に上限へ達し、まだ試していない `/a-b` にも候補がある状況。
    // 打ち切りは「2 件目が無い」ことの証明にならないため、一意と断定してはいけない。
    const exists = existsIn(['/a', '/a/b', '/a-b']);
    expect(extractRepoNameFromProjectDirPath(fileFor('-a-b'), exists, 2)).toBeNull();
    // 上限に達しなければ、同じ入力は「候補 2 件＝曖昧」として null になる。
    expect(extractRepoNameFromProjectDirPath(fileFor('-a-b'), exists)).toBeNull();
    // 打ち切らずに探索し切れば復元できる（上の null がガード由来であることの対照）。
    expect(extractRepoNameFromProjectDirPath(fileFor('-a-b'), existsIn(['/a', '/a/b']), 3)).toBe('b');
  });

  it('returns null when the path is not under a projects directory', () => {
    expect(
      extractRepoNameFromProjectDirPath('/somewhere/else/sid.jsonl', existsIn(['/somewhere'])),
    ).toBeNull();
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

describe('deriveRepoNameFromCwd — Windows パス', () => {
  it('normalizes drive-letter and UNC paths', () => {
    // Codex の repo 帰属をこの関数へ一本化したので、Windows の cwd が絶対パス全体を
    // repo 名にしてしまうと全 Codex セッションが誤分類される。
    expect(deriveRepoNameFromCwd('C:\\work\\repo', () => false)).toBe('repo');
    expect(deriveRepoNameFromCwd('C:\\work\\repo\\', () => false)).toBe('repo');
    expect(deriveRepoNameFromCwd('C:\\work\\repo\\.worktrees\\foo', () => false)).toBe('repo');
    expect(deriveRepoNameFromCwd('\\\\server\\share\\repo', () => false)).toBe('repo');
  });

  it('does not rewrite a POSIX path that legitimately contains a backslash', () => {
    // POSIX のファイル名にバックスラッシュを含められるので、無条件置換は別の repo 名を導く。
    expect(deriveRepoNameFromCwd('/tmp/we\\ird', () => false)).toBe('we\\ird');
  });
});

describe('resolveCodexRepoName', () => {
  const resolved = (cwd: string) => resolveCodexRepoName({ kind: 'resolved', cwd });

  it('folds a worktree checkout into its parent repository', () => {
    // 従来 gitRoot 配下として primaryRepoName が付いていた経路と同じ結果になること。
    expect(resolved('/work/anytime-markdown/.worktrees/foo')).toBe('anytime-markdown');
    expect(resolved('/work/anytime-markdown/.claude-worktrees/bar')).toBe('anytime-markdown');
  });

  it('uses the basename for a workspace root outside the primary repository', () => {
    expect(resolved('/workspace')).toBe('workspace');
    expect(resolved('/workspace/.worktrees/gphotos-copy')).toBe('workspace');
    expect(resolved('/Shared/anytime-markdown-docs')).toBe('anytime-markdown-docs');
    expect(resolved('/home/user/.claude')).toBe('.claude');
  });

  it('does not confuse a sibling sharing a prefix with the primary repository', () => {
    expect(resolved('/work/anytime-markdown-2')).toBe('anytime-markdown-2');
  });

  it('returns the unknown sentinel for absent, unreadable, or unusable cwd', () => {
    // cwd 不明を主リポジトリ名へ寄せると他ワークスペースを自リポジトリへ誤ラベルするため、
    // 判別可能な専用の名前を返す。
    expect(resolveCodexRepoName({ kind: 'absent' })).toBe(CODEX_UNKNOWN_REPO_NAME);
    expect(resolveCodexRepoName({ kind: 'unreadable', error: new Error('EACCES') })).toBe(
      CODEX_UNKNOWN_REPO_NAME,
    );
    expect(resolved('/')).toBe(CODEX_UNKNOWN_REPO_NAME);
    expect(resolved('')).toBe(CODEX_UNKNOWN_REPO_NAME);
  });
});

describe('readCodexSessionCwd', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cwd-'));

  const write = (name: string, content: string): string => {
    const p = path.join(tmpRoot, name);
    fs.writeFileSync(p, content);
    return p;
  };

  it('reads cwd out of the nested session_meta payload', () => {
    const p = write(
      'meta.jsonl',
      JSON.stringify({ type: 'session_meta', payload: { cwd: '/workspace' } }) + '\n',
    );
    expect(readCodexSessionCwd(p)).toEqual({ kind: 'resolved', cwd: '/workspace' });
  });

  it('skips non session_meta records and invalid JSON lines', () => {
    const p = write(
      'mixed.jsonl',
      [
        'not json',
        JSON.stringify({ type: 'turn', payload: { cwd: '/decoy' } }),
        JSON.stringify({ type: 'session_meta', payload: { cwd: '/real' } }),
      ].join('\n') + '\n',
    );
    expect(readCodexSessionCwd(p)).toEqual({ kind: 'resolved', cwd: '/real' });
  });

  it('reports absent when cwd is not a string or session_meta is missing', () => {
    const notString = write(
      'notstring.jsonl',
      JSON.stringify({ type: 'session_meta', payload: { cwd: 12345 } }) + '\n',
    );
    expect(readCodexSessionCwd(notString)).toEqual({ kind: 'absent' });
    expect(readCodexSessionCwd(write('nometa.jsonl', '{}\n'))).toEqual({ kind: 'absent' });
    expect(readCodexSessionCwd(write('empty.jsonl', ''))).toEqual({ kind: 'absent' });
  });

  it('reports unreadable (not absent) when the file cannot be read', () => {
    // 読み取り失敗を absent と同じに畳むと、バックフィルが正しい repo 帰属を上書きする。
    const missing = readCodexSessionCwd(path.join(tmpRoot, 'missing.jsonl'));
    expect(missing.kind).toBe('unreadable');
    const asDir = path.join(tmpRoot, 'as-dir.jsonl');
    fs.mkdirSync(asDir, { recursive: true });
    expect(readCodexSessionCwd(asDir).kind).toBe('unreadable');
  });

  it('drops the line that the byte cap cut in half instead of parsing it', () => {
    // 上限で切れた行を JSON として食わないこと。maxBytes を注入して 1MiB の
    // フィクスチャを書かずに境界を検証する。
    const first = JSON.stringify({ type: 'noise', payload: { pad: 'x'.repeat(200) } });
    const second = JSON.stringify({ type: 'session_meta', payload: { cwd: '/workspace' } });
    const p = write('truncated.jsonl', `${first}\n${second}\n`);
    // 1 行目 + 改行 + 2 行目の途中まで => 2 行目は不完全なので捨てられ absent になる。
    const cap = first.length + 1 + Math.floor(second.length / 2);
    expect(readCodexSessionCwd(p, cap)).toEqual({ kind: 'absent' });
    // 上限内に session_meta が収まれば読める。
    expect(readCodexSessionCwd(p, first.length + 1 + second.length + 1)).toEqual({
      kind: 'resolved',
      cwd: '/workspace',
    });
  });

  it('keeps a complete final line that has no trailing newline', () => {
    // ファイル長がちょうど上限で末尾に改行が無い場合に、完全な最終行を捨てないこと。
    const line = JSON.stringify({ type: 'session_meta', payload: { cwd: '/workspace' } });
    const p = write('nonewline.jsonl', line);
    // 上限に達せず EOF へ届くので、改行が無くても最終行は完全。
    expect(readCodexSessionCwd(p, line.length + 64)).toEqual({ kind: 'resolved', cwd: '/workspace' });
  });
});
