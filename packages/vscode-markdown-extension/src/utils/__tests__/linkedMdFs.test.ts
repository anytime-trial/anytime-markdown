import * as path from 'path';
import {
  isWithinRoot,
  resolveLinkedMdCandidates,
  stripHrefDecorations,
  tokensMatch,
} from '../linkedMdFs';

const WS = path.resolve('/ws');
const DOC_DIR = path.resolve('/ws/notes');

describe('stripHrefDecorations', () => {
  it('anchor を path から分離する', () => {
    expect(stripHrefDecorations('a.md#sec')).toEqual({ path: 'a.md', anchor: 'sec' });
  });

  it('query を除去し anchor は null にする', () => {
    expect(stripHrefDecorations('a.md?x=1')).toEqual({ path: 'a.md', anchor: null });
  });

  it('装飾無し href をそのまま返す', () => {
    expect(stripHrefDecorations('a.md')).toEqual({ path: 'a.md', anchor: null });
  });
});

describe('isWithinRoot', () => {
  it('root 配下を true にする', () => {
    expect(isWithinRoot(path.resolve('/ws/notes/a.md'), WS)).toBe(true);
  });

  it('root 外を false にする', () => {
    expect(isWithinRoot(path.resolve('/other/a.md'), WS)).toBe(false);
  });

  it('root 未定義を false にする', () => {
    expect(isWithinRoot(path.resolve('/ws/a.md'), undefined)).toBe(false);
  });

  it('root 自身を true にする', () => {
    expect(isWithinRoot(WS, WS)).toBe(true);
  });
});

describe('tokensMatch', () => {
  it('mtimeMs と size が一致すれば true', () => {
    expect(tokensMatch({ mtimeMs: 1, size: 2 }, { mtimeMs: 1, size: 2 })).toBe(true);
  });

  it('mtimeMs 差を false にする', () => {
    expect(tokensMatch({ mtimeMs: 1, size: 2 }, { mtimeMs: 3, size: 2 })).toBe(false);
  });

  it('size 差を false にする', () => {
    expect(tokensMatch({ mtimeMs: 1, size: 2 }, { mtimeMs: 1, size: 3 })).toBe(false);
  });
});

describe('resolveLinkedMdCandidates', () => {
  it('markdown 候補のみ返す', () => {
    expect(resolveLinkedMdCandidates('a.md', DOC_DIR, WS)).toEqual([
      path.resolve(DOC_DIR, 'a.md'),
      path.resolve(WS, 'a.md'),
    ]);
  });

  it('非 markdown 候補を除外する', () => {
    expect(resolveLinkedMdCandidates('a.txt', DOC_DIR, WS)).toEqual([]);
  });

  it('workspace 外候補を除外する', () => {
    expect(resolveLinkedMdCandidates('../../outside.md', DOC_DIR, WS)).toEqual([]);
  });

  it('workspaceRoot 未定義時は docDir 配下を許可する', () => {
    expect(resolveLinkedMdCandidates('a.markdown#sec', DOC_DIR, undefined)).toEqual([
      path.resolve(DOC_DIR, 'a.markdown'),
    ]);
  });

  it('workspaceRoot 未定義時は docDir 外を除外する', () => {
    expect(resolveLinkedMdCandidates('../a.md', DOC_DIR, undefined)).toEqual([]);
  });
});
