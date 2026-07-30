import * as vscode from 'vscode';

import {
  parseGitHubRemote,
  readTicketConfig,
  pickProviderKind,
  resolveTicketsRepoRoot,
  resolveTicketSource,
} from '../repoResolver';

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
      resolveTicketSource({ repo: '', branch: '', provider: 'github-contents' }, gitFacts, '/repo'),
    ).toEqual({ repo: 'anytime-trial/anytime-markdown', branch: 'develop', provider: 'github-contents' });
  });

  it('設定が git 実測より優先される', () => {
    expect(
      resolveTicketSource({ repo: 'o/r', branch: 'main', provider: 'github-contents' }, gitFacts, '/repo'),
    ).toEqual({ repo: 'o/r', branch: 'main', provider: 'github-contents' });
  });

  it('repo が解決できなければ null', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-contents' },
        { remoteUrl: 'https://gitlab.com/o/r.git', branch: 'main' },
        '/repo',
      ),
    ).toBeNull();
  });

  it('github-contents で branch が解決できなければ null', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-contents' },
        { remoteUrl: gitFacts.remoteUrl, branch: null },
        '/repo',
      ),
    ).toBeNull();
  });

  it('local-git はローカルクローンのルートだけで解決し、remote / branch を要求しない', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'local-git' },
        { remoteUrl: null, branch: null },
        '/home/user/anytime-ticket',
      ),
    ).toEqual({ provider: 'local-git', repoRoot: '/home/user/anytime-ticket' });
  });

  it('local-git はクローンのルートを解決できなければ null', () => {
    expect(
      resolveTicketSource({ repo: '', branch: '', provider: 'local-git' }, gitFacts, null),
    ).toBeNull();
  });

  it('local-git は GitHub 用の repo 設定に引きずられない（設定が残っていても無視する）', () => {
    expect(
      resolveTicketSource({ repo: 'o/r', branch: 'main', provider: 'local-git' }, gitFacts, '/local'),
    ).toEqual({ provider: 'local-git', repoRoot: '/local' });
  });

  it('github-issues は branch 不要なので解決できる', () => {
    expect(
      resolveTicketSource(
        { repo: '', branch: '', provider: 'github-issues' },
        { remoteUrl: gitFacts.remoteUrl, branch: '' },
        '/repo',
      ),
    ).toEqual({ repo: 'anytime-trial/anytime-markdown', branch: '', provider: 'github-issues' });
  });
});

describe('pickProviderKind', () => {
  it('どちらも未設定なら既定は local-git（GitHub 認証を要求しない）', () => {
    expect(
      pickProviderKind({ provider: undefined, legacyProvider: undefined, hasLegacyRepo: false }),
    ).toEqual({ kind: 'local-git', usedLegacy: false });
  });

  it('新キーが設定されていればそれを使う', () => {
    expect(
      pickProviderKind({
        provider: 'github-issues',
        legacyProvider: 'github-contents',
        hasLegacyRepo: true,
      }),
    ).toEqual({ kind: 'github-issues', usedLegacy: false });
  });

  it('新キーが未設定なら旧キーの値を尊重する（既存利用者の設定を黙って無効化しない）', () => {
    expect(
      pickProviderKind({ provider: undefined, legacyProvider: 'github-contents', hasLegacyRepo: false }),
    ).toEqual({ kind: 'github-contents', usedLegacy: true });
  });

  it('provider 未設定でも github.repo が明示されていれば github-contents を維持する', () => {
    // 旧既定（github-contents）に任せて repo だけ設定していた利用者が、既定変更で
    // 「リポジトリを解決できません」に落ちて無言で機能停止するのを防ぐ。
    expect(
      pickProviderKind({ provider: undefined, legacyProvider: undefined, hasLegacyRepo: true }),
    ).toEqual({ kind: 'github-contents', usedLegacy: true });
  });

  it('新キーが明示されていれば github.repo が残っていても新キーが勝つ', () => {
    expect(
      pickProviderKind({ provider: 'local-git', legacyProvider: undefined, hasLegacyRepo: true }),
    ).toEqual({ kind: 'local-git', usedLegacy: false });
  });
});

describe('readTicketConfig（設定値の検証）', () => {
  /** `inspect()` が明示値を返す設定モック。`get()` は package.json の既定値相当。 */
  function mockConfig(explicit: Record<string, Record<string, unknown>>): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
      get: () => '',
      inspect: (key: string) =>
        explicit[section]?.[key] === undefined ? undefined : { globalValue: explicit[section][key] },
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('綴り間違いの provider は採用せず既定へ倒し、不正値を報告する', () => {
    // package.json の enum は設定 UI を絞るだけで、手書きの settings.json は素通りする。
    // 未検証だと "github" のような値がどの分岐にも当たらず、無言で別のプロバイダになる。
    mockConfig({ 'anytimeAgent.tickets': { provider: 'github' } });

    const config = readTicketConfig();

    expect(config.provider).toBe('local-git');
    expect(config.invalidProviderValues).toEqual(['github']);
  });

  it('文字列でない値も不正として扱う', () => {
    mockConfig({ 'anytimeAgent.tickets': { provider: 42 } });

    expect(readTicketConfig().invalidProviderValues).toEqual(['42']);
  });

  it('旧キー側の不正値も報告する', () => {
    mockConfig({ 'anytimeAgent.tickets.github': { provider: 'gh-contents' } });

    const config = readTicketConfig();

    expect(config.provider).toBe('local-git');
    expect(config.invalidProviderValues).toEqual(['gh-contents']);
  });

  it('正しい値なら不正値の報告は空', () => {
    mockConfig({ 'anytimeAgent.tickets': { provider: 'github-issues' } });

    const config = readTicketConfig();

    expect(config.provider).toBe('github-issues');
    expect(config.invalidProviderValues).toEqual([]);
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
