import { parseGitHubRemote } from '../parseGitHubRemote';

describe('parseGitHubRemote', () => {
  it('parses scp-style git@github.com:owner/name.git', () => {
    expect(parseGitHubRemote('git@github.com:acme/widget.git')).toEqual({ owner: 'acme', name: 'widget' });
  });

  it('parses https with and without .git', () => {
    expect(parseGitHubRemote('https://github.com/acme/widget.git')).toEqual({ owner: 'acme', name: 'widget' });
    expect(parseGitHubRemote('https://github.com/acme/widget')).toEqual({ owner: 'acme', name: 'widget' });
  });

  it('parses https with trailing slash', () => {
    expect(parseGitHubRemote('https://github.com/acme/widget/')).toEqual({ owner: 'acme', name: 'widget' });
  });

  it('parses ssh:// form', () => {
    expect(parseGitHubRemote('ssh://git@github.com/acme/widget.git')).toEqual({ owner: 'acme', name: 'widget' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseGitHubRemote('  git@github.com:acme/widget.git\n')).toEqual({ owner: 'acme', name: 'widget' });
  });

  it('returns null for non-GitHub hosts', () => {
    expect(parseGitHubRemote('git@gitlab.com:acme/widget.git')).toBeNull();
    expect(parseGitHubRemote('https://bitbucket.org/acme/widget')).toBeNull();
  });

  it('returns null for empty / nullish input', () => {
    expect(parseGitHubRemote('')).toBeNull();
    expect(parseGitHubRemote('   ')).toBeNull();
    expect(parseGitHubRemote(null)).toBeNull();
    expect(parseGitHubRemote(undefined)).toBeNull();
  });

  it('returns null when name contains a slash (nested path)', () => {
    // name.includes('/') check: nested path 形式は name に '/' が残るため null
    expect(parseGitHubRemote('https://github.com/acme/sub/nested')).toBeNull();
  });

  it('skips a github.com substring not followed by / or : and finds the real host', () => {
    // 'github.commercial' の github.com は直後が 'm' なのでスキップし、後続の本物の host を採る
    expect(parseGitHubRemote('https://github.commercial.example/x@github.com:acme/widget.git')).toEqual({
      owner: 'acme',
      name: 'widget',
    });
  });

  it('parses pathological large input in linear time (js/polynomial-redos regression)', () => {
    // 巨大入力でもバックトラッキングで停止しない (indexOf ベースの O(n) 実装)
    const longName = 'x'.repeat(100000);
    const start = Date.now();
    expect(parseGitHubRemote(`https://github.com/acme/${longName}`)).toEqual({ owner: 'acme', name: longName });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
