import { parseGitHubRemote, resolveTicketSource } from '../repoResolver';

describe('parseGitHubRemote', () => {
  it.each([
    ['git@github.com:anytime-trial/anytime-markdown.git', 'anytime-trial/anytime-markdown'],
    ['git@github.com:anytime-trial/anytime-markdown', 'anytime-trial/anytime-markdown'],
    ['https://github.com/anytime-trial/anytime-markdown.git', 'anytime-trial/anytime-markdown'],
    ['https://github.com/anytime-trial/anytime-markdown', 'anytime-trial/anytime-markdown'],
    ['ssh://git@github.com/anytime-trial/anytime-markdown.git', 'anytime-trial/anytime-markdown'],
    ['  https://github.com/owner/repo.git\n', 'owner/repo'],
  ])('%s から owner/repo を取り出す', (url, expected) => {
    expect(parseGitHubRemote(url)).toBe(expected);
  });

  it.each([
    'https://gitlab.com/owner/repo.git',
    'git@bitbucket.org:owner/repo.git',
    'https://github.example.com/owner/repo.git',
    '',
    'not a url',
  ])('GitHub 以外・不正な URL は null を返す: %s', (url) => {
    expect(parseGitHubRemote(url)).toBeNull();
  });

  it('サブグループのような 3 階層パスは受け付けない', () => {
    expect(parseGitHubRemote('https://github.com/owner/group/repo.git')).toBeNull();
  });
});

describe('resolveTicketSource', () => {
  const gitFacts = {
    remoteUrl: 'git@github.com:anytime-trial/anytime-markdown.git',
    branch: 'develop',
  };

  it('設定が空なら git 実測から解決する', () => {
    expect(
      resolveTicketSource({ repo: '', branch: '', provider: 'github-contents' }, gitFacts),
    ).toEqual({ repo: 'anytime-trial/anytime-markdown', branch: 'develop', provider: 'github-contents' });
  });

  it('設定が git 実測より優先される', () => {
    expect(
      resolveTicketSource({ repo: 'o/r', branch: 'main', provider: 'github-contents' }, gitFacts),
    ).toEqual({ repo: 'o/r', branch: 'main', provider: 'github-contents' });
  });

  it('repo が解決できなければ null', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-contents' },
        { remoteUrl: 'https://gitlab.com/o/r.git', branch: 'main' },
      ),
    ).toBeNull();
  });

  it('github-contents で branch が解決できなければ null', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-contents' },
        { remoteUrl: gitFacts.remoteUrl, branch: null },
      ),
    ).toBeNull();
  });

  it('github-issues は branch 不要なので解決できる', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-issues' },
        { remoteUrl: gitFacts.remoteUrl, branch: '' },
      ),
    ).toEqual({ repo: 'anytime-trial/anytime-markdown', branch: '', provider: 'github-issues' });
  });
});
