import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractRepoNameFromJsonl } from '../sessionMeta';

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
