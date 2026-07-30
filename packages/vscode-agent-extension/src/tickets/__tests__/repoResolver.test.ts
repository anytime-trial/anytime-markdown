import { parseGitHubRemote, resolveTicketsRepoRoot, resolveTicketSource } from '../repoResolver';

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

  it.each([
    // 認証情報付き URL: 資格情報混入・SSRF 対策として reject を固定する
    'https://user:token@github.com/owner/repo.git',
    // git:// プロトコル: HTTPS/SSH 以外は受け付けない
    'git://github.com/owner/repo.git',
    // ポート番号付き: ホスト名に想定外のサフィックスが付くケースを reject 固定する
    'https://github.com:443/owner/repo.git',
  ])('セキュリティ境界: %s は null を返す', (url) => {
    expect(parseGitHubRemote(url)).toBeNull();
  });

  it('ホスト名の大文字小文字違いは意図的に reject する(実際の git remote URL は小文字が大半のため)', () => {
    expect(parseGitHubRemote('https://GitHub.com/owner/repo.git')).toBeNull();
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

describe('resolveTicketsRepoRoot', () => {
  const base = {
    configured: '',
    workspaceRoot: '/ws',
    workspaceHasTicketsDir: false,
    envDir: undefined,
  };

  it('設定が絶対パスならそのまま使う', () => {
    expect(resolveTicketsRepoRoot({ ...base, configured: '/Shared/anytime-ticket' })).toBe(
      '/Shared/anytime-ticket',
    );
  });

  it('設定がワークスペース相対なら解決する', () => {
    expect(resolveTicketsRepoRoot({ ...base, configured: '../tickets-repo' })).toBe(
      '/tickets-repo',
    );
  });

  it('設定が .tickets 自体を指す場合は親をリポジトリルートにする', () => {
    expect(resolveTicketsRepoRoot({ ...base, configured: '/Shared/anytime-ticket/.tickets' })).toBe(
      '/Shared/anytime-ticket',
    );
  });

  it('設定が空ならワークスペース直下の .tickets を使う', () => {
    expect(resolveTicketsRepoRoot({ ...base, workspaceHasTicketsDir: true })).toBe('/ws');
  });

  it('設定もワークスペースの .tickets も無ければ環境変数を使う', () => {
    expect(resolveTicketsRepoRoot({ ...base, envDir: '/env/tickets' })).toBe('/env/tickets');
  });

  it('設定はワークスペース直下の .tickets より優先される', () => {
    expect(
      resolveTicketsRepoRoot({
        ...base,
        configured: '/Shared/anytime-ticket',
        workspaceHasTicketsDir: true,
        envDir: '/env/tickets',
      }),
    ).toBe('/Shared/anytime-ticket');
  });

  it('どれも無ければ null', () => {
    expect(resolveTicketsRepoRoot(base)).toBeNull();
  });

  it('相対パス設定でワークスペースが無ければ解決できず null', () => {
    expect(
      resolveTicketsRepoRoot({ ...base, workspaceRoot: null, configured: 'relative/path' }),
    ).toBeNull();
  });
});
