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
});
