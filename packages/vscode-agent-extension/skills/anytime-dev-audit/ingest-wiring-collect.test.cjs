const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deepMerge,
  lepConfigCandidates,
  loadLepConfig,
  resolveWatchedRepoPaths,
  resolveRepoName,
  sqlQuote,
  queryWithRepoName,
  readIngestFreshness,
  readPipelineStreaks,
  extractReasonCode,
  summarizeSkipStreaks,
  readDeclaredDocsRoot,
  collectFacts,
  INGEST_SQL,
} = require('./ingest-wiring-collect.cjs');
const { mergeSettings } = require('./ingest-wiring-settings.cjs');
const { judge, summarize, SKIP_STREAK } = require('./ingest-wiring-judge.cjs');

const NOW = '2026-09-12T12:00:00.000Z';
const byId = (findings, id) => findings.find((f) => f.id === id);

/** 指定したクエリ結果を返すだけの偽リーダ（sqlite を要さずに取得層を検査する）。 */
function fakeReader(responses, kind = 'better-sqlite3') {
  const calls = [];
  return {
    calls,
    reader: {
      kind,
      query(dbPath, sql, params) {
        calls.push({ dbPath, sql, params });
        const hit = responses.find((r) => sql.includes(r.match));
        if (hit?.throws) throw new Error(hit.throws);
        return hit?.rows ?? [];
      },
    },
  };
}

describe('deepMerge', () => {
  it('ネストを再帰的に合成し、後勝ちで上書きする', () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({ a: { b: 1, c: 3 } });
  });

  it('配列は合成せず置換する', () => {
    expect(deepMerge({ g: ['a'] }, { g: ['b'] })).toEqual({ g: ['b'] });
  });
});

describe('lepConfigCandidates / loadLepConfig', () => {
  it('home → workspace → workspace.local の順（precedence 低→高）', () => {
    expect(lepConfigCandidates('/ws', '/home/u', null)).toEqual([
      '/home/u/.anytime/trail/lep.json',
      '/ws/.anytime/trail/lep.json',
      '/ws/.anytime/trail/lep.local.json',
    ]);
  });

  it('configPath 指定時はそのファイルだけを見る', () => {
    expect(lepConfigCandidates('/ws', '/home/u', '/custom/lep.json')).toEqual(['/custom/lep.json']);
  });

  it('lep.local.json の gitRoots が workspace の lep.json を上書きする', () => {
    const files = {
      '/ws/.anytime/trail/lep.json': '{"stage":"all","sources":{"gitRoots":[]}}',
      '/ws/.anytime/trail/lep.local.json': '{"sources":{"gitRoots":["/repo-a"]}}',
    };
    const result = loadLepConfig(Object.keys(files), (p) => files[p], (p) => p in files);
    expect(result.config).toEqual({ stage: 'all', sources: { gitRoots: ['/repo-a'] } });
    expect(result.loadedPaths).toEqual(Object.keys(files));
    expect(result.failedPaths).toEqual([]);
  });

  it('1 ファイルも無ければ config は null（loadedPaths も空）', () => {
    const result = loadLepConfig(['/nope.json'], () => '', () => false);
    expect(result).toMatchObject({ config: null, loadedPaths: [] });
  });

  it('壊れたファイルは failedPaths へ分け、loadedPaths（成立したマージ連鎖）に混ぜない', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const files = { '/a.json': '{"stage":"all"}', '/b.json': '{broken' };
    const result = loadLepConfig(['/a.json', '/b.json'], (p) => files[p], (p) => p in files);
    expect(result.config).toEqual({ stage: 'all' });
    expect(result.loadedPaths).toEqual(['/a.json']);
    expect(result.failedPaths).toEqual([{ file: '/b.json', reason: expect.any(String) }]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('解析に失敗'));
    spy.mockRestore();
  });
});

describe('resolveWatchedRepoPaths', () => {
  const settingsWith = (value) =>
    mergeSettings([
      { scope: 'workspace', file: '/w.json', content: JSON.stringify({ 'anytimeTrail.workspace.path': value }) },
    ]);

  it('workspace.path が非空ならワークスペースフォルダを上書きする', () => {
    const { paths, overriddenBySetting } = resolveWatchedRepoPaths({
      lepConfig: { sources: { gitRoots: [] } },
      settings: settingsWith('/Shared/other-project'),
      workspaceRoot: '/ws',
    });
    expect(paths).toEqual([{ path: '/Shared/other-project', origin: 'anytimeTrail.workspace.path' }]);
    expect(overriddenBySetting).toBe(true);
  });

  it('workspace.path が空文字ならワークスペースルートへフォールバックする', () => {
    const { paths, overriddenBySetting } = resolveWatchedRepoPaths({
      lepConfig: { sources: { gitRoots: [] } },
      settings: settingsWith('   '),
      workspaceRoot: '/ws',
    });
    expect(paths).toEqual([{ path: '/ws', origin: 'workspaceFolder' }]);
    expect(overriddenBySetting).toBe(false);
  });

  it('gitRoots と合成し、重複は先勝ちで 1 件に畳む', () => {
    const { paths } = resolveWatchedRepoPaths({
      lepConfig: { sources: { gitRoots: ['/repo-a', '/ws'] } },
      settings: settingsWith(''),
      workspaceRoot: '/ws',
    });
    expect(paths.map((p) => p.path)).toEqual(['/repo-a', '/ws']);
    expect(paths[1].origin).toBe('lep.sources.gitRoots');
  });

  it('相対パスは cwd ではなくワークスペースルート基準で解決する', () => {
    const { paths } = resolveWatchedRepoPaths({
      lepConfig: { sources: { gitRoots: ['./sub-repo'] } },
      settings: settingsWith(''),
      workspaceRoot: '/ws',
    });
    expect(paths[0].path).toBe('/ws/sub-repo');
  });
});

describe('resolveRepoName', () => {
  it('git ルートの basename を sanitize せずに使う（本番の repoName 導出と同じ）', () => {
    expect(resolveRepoName('/x/my repo', '/x/my repo')).toBe('my repo');
  });

  it('worktree 直下は親リポジトリ名へ正規化する', () => {
    expect(resolveRepoName('/x/anytime-markdown/.worktrees/feat', '/x/anytime-markdown/.worktrees/feat')).toBe(
      'anytime-markdown',
    );
    expect(resolveRepoName('/x/repo/.claude-worktrees/a', '/x/repo/.claude-worktrees/a')).toBe('repo');
  });

  it('Windows の git 出力（スラッシュ区切り）も分解できる', () => {
    // git rev-parse --show-toplevel は Windows でもスラッシュで返すため、path.sep だけでは分割できない。
    expect(resolveRepoName('C:\\Users\\foo\\repo', 'C:/Users/foo/repo')).toBe('repo');
    expect(resolveRepoName('C:/x/repo/.worktrees/a', 'C:/x/repo/.worktrees/a')).toBe('repo');
  });

  it('git ルートを取れない場合はワークスペースパスへフォールバックする', () => {
    expect(resolveRepoName('/x/plain-dir', null)).toBe('plain-dir');
  });

  it('サブディレクトリで実行しても git ルート側の名前になる', () => {
    expect(resolveRepoName('/x/repo/packages/foo', '/x/repo')).toBe('repo');
  });
});

describe('SQL の組み立て', () => {
  it('better-sqlite3 経路はプレースホルダでバインドする', () => {
    const { reader, calls } = fakeReader([{ match: 'activity_session_commits', rows: [] }]);
    queryWithRepoName(reader, '/db', INGEST_SQL, "o'brien");
    expect(calls[0].sql).toContain('r.repo_name = ?');
    expect(calls[0].params).toEqual(["o'brien"]);
  });

  it('sqlite3 CLI 経路は引用符をエスケープして埋め込む', () => {
    const { reader, calls } = fakeReader([{ match: 'activity_session_commits', rows: [] }], 'sqlite3-cli');
    queryWithRepoName(reader, '/db', INGEST_SQL, "o'brien");
    expect(calls[0].sql).toContain("r.repo_name = 'o''brien'");
  });

  it('sqlQuote は引用符を二重化する', () => {
    expect(sqlQuote("a'b")).toBe("'a''b'");
  });

  it('リポジトリ名に $ + & が含まれても置換文字列として特殊展開されない', () => {
    const evil = ['a', '$', '&', 'b'].join('');
    const { reader, calls } = fakeReader([{ match: 'activity_session_commits', rows: [] }], 'sqlite3-cli');
    queryWithRepoName(reader, '/db', INGEST_SQL, evil);
    expect(calls[0].sql).toContain("r.repo_name = '" + evil + "'");
  });
});

describe('readIngestFreshness', () => {
  const dbDir = { path: '/db', exists: true };
  const alwaysExists = () => true;

  it('該当リポジトリの行があればそれで絞り、scope に repo 名を出す', () => {
    const { reader } = fakeReader([{ match: 'activity_repos', rows: [{ last: '2026-09-12T11:00:00.000Z' }] }]);
    expect(readIngestFreshness({ reader, dbDir, repoName: 'ws', existsSync: alwaysExists })).toEqual({
      status: 'ok',
      lastCommittedAt: '2026-09-12T11:00:00.000Z',
      scope: 'repo=ws',
    });
  });

  it('該当リポジトリの行が無ければ全リポジトリ集計へ落ち、その旨を scope に明記する', () => {
    const { reader } = fakeReader([
      { match: 'activity_repos', rows: [{ last: null }] },
      { match: 'SELECT MAX(committed_at)', rows: [{ last: '2026-09-01T00:00:00.000Z' }] },
    ]);
    const result = readIngestFreshness({ reader, dbDir, repoName: 'ws', existsSync: alwaysExists });
    expect(result.lastCommittedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(result.scope).toContain('全リポジトリ');
    expect(result.scope).toContain('停止を隠し得る');
  });

  it('リーダが無ければ理由付きで測定不能（0 を返さない）', () => {
    expect(readIngestFreshness({ reader: null, readerReason: 'CLI も不在', dbDir })).toEqual({
      status: 'unmeasurable',
      reason: 'CLI も不在',
    });
  });

  it('DB ファイルが無ければ測定不能', () => {
    const { reader } = fakeReader([]);
    expect(readIngestFreshness({ reader, dbDir, repoName: 'ws', existsSync: () => false })).toMatchObject({
      status: 'unmeasurable',
    });
  });

  it('クエリが落ちたら測定不能（例外を外へ出さない）', () => {
    const { reader } = fakeReader([{ match: 'activity_repos', throws: 'file is not a database' }]);
    const result = readIngestFreshness({ reader, dbDir, repoName: 'ws', existsSync: alwaysExists });
    expect(result).toMatchObject({ status: 'unmeasurable' });
    expect(result.reason).toContain('file is not a database');
  });
});

describe('readPipelineStreaks', () => {
  const dbDir = { path: '/db', exists: true };

  it('scope 別の連続 skip を集計する', () => {
    const rows = Array.from({ length: SKIP_STREAK }, () => ({
      scope: 'conversation_incremental',
      status: 'skipped',
      error_detail: 'skipped: llm_unavailable — chat 12345',
    }));
    const { reader } = fakeReader([{ match: 'caravan_pipeline_runs', rows }]);
    const result = readPipelineStreaks({ reader, dbDir, existsSync: () => true });
    expect(result.scopes[0]).toMatchObject({ scope: 'conversation_incremental', skipStreak: SKIP_STREAK });
    expect(result.scopes[0].reasonCodes).toEqual(['llm_unavailable']);
  });

  it('リーダが無ければ理由付きで測定不能', () => {
    expect(readPipelineStreaks({ reader: null, readerReason: 'リーダ無し', dbDir })).toEqual({
      status: 'unmeasurable',
      reason: 'リーダ無し',
    });
  });
});

describe('extractReasonCode / summarizeSkipStreaks', () => {
  it('可変の detail を落として理由コードだけを取る', () => {
    expect(extractReasonCode('skipped: llm_unavailable — chat 9f2c…')).toBe('llm_unavailable');
    expect(extractReasonCode('llm_unavailable')).toBe('llm_unavailable');
    expect(extractReasonCode('')).toBeNull();
  });

  it('detail が毎回異なっても理由コードは 1 件に畳み、全文は 3 件まで evidence に残す', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      scope: 'a',
      status: 'skipped',
      error_detail: `skipped: llm_unavailable — chat ${i}`,
    }));
    const [s] = summarizeSkipStreaks(rows);
    expect(s.reasonCodes).toEqual(['llm_unavailable']);
    expect(s.samples).toHaveLength(3);
  });

  it('新しい順の先頭から連続する skipped だけを数える', () => {
    const rows = ['skipped', 'skipped', 'success', 'skipped'].map((status) => ({ scope: 'a', status, error_detail: '' }));
    expect(summarizeSkipStreaks(rows)[0]).toMatchObject({ skipStreak: 2, sampled: 4 });
  });

  it('先頭が skipped でなければ 0 本', () => {
    const rows = ['success', 'skipped'].map((status) => ({ scope: 'a', status, error_detail: '' }));
    expect(summarizeSkipStreaks(rows)[0].skipStreak).toBe(0);
  });

  it('scope ごとに分けて連続本数の降順で返す', () => {
    const rows = [
      { scope: 'a', status: 'success', error_detail: '' },
      { scope: 'b', status: 'skipped', error_detail: '' },
      { scope: 'b', status: 'skipped', error_detail: '' },
    ];
    expect(summarizeSkipStreaks(rows).map((s) => s.scope)).toEqual(['b', 'a']);
  });
});

describe('collectFacts（実ファイル走査）', () => {
  let sandbox;
  let fakeHome;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-wiring-'));
    // home は必ずワークスペースと別にする。同一だと lep.json の home tier と workspace tier が
    // 同じファイルを指し、loadedPaths が重複する。
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-wiring-home-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const write = (rel, content) => {
    const file = path.join(sandbox, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  it('Trail 未導入のワークスペースは dbDir.exists=false になり、判定は対象外へ落ちる', async () => {
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: fakeHome });
    expect(facts.dbDir.exists).toBe(false);
    // D1〜D5（Trail 未導入）に加え D6（索引機能 未導入）も対象外になる
    expect(summarize(judge(facts))).toMatchObject({ error: 0, warn: 0, notApplicable: 6 });
  });

  it('settings と lep.json から監視対象・stage・docsRoot を解決する', async () => {
    write('.vscode/settings.json', JSON.stringify({
      'anytimeTrail.workspace.path': '/nonexistent-repo',
      'anytimeMarkdown.docsRoot': '/nonexistent-docs',
    }));
    write('.anytime/trail/lep.json', JSON.stringify({
      stage: 'All',
      sources: { gitRoots: [] },
      llm: { providers: { ollama: { baseUrl: 'http://localhost:11434' } } },
    }));
    fs.mkdirSync(path.join(sandbox, '.anytime', 'trail', 'db'), { recursive: true });

    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: fakeHome });

    expect(facts.watched).toEqual([
      {
        path: '/nonexistent-repo',
        realPath: '/nonexistent-repo',
        origin: 'anytimeTrail.workspace.path',
        exists: false,
        isGitWorkTree: null,
      },
    ]);
    expect(facts.lep.config.stage).toBe('All');
    expect(facts.docIndex.docsRoot).toBe('/nonexistent-docs');
    expect(facts.llm).toEqual([
      { provider: 'ollama', baseUrl: 'http://localhost:11434', status: 'skipped', detail: '--no-network のため未疎通' },
    ]);

    const findings = judge(facts);
    expect(byId(findings, 'D1').status).toBe('fired');
    expect(byId(findings, 'D5').status).toBe('fired');
    expect(byId(findings, 'D6').status).toBe('fired');
    expect(byId(findings, 'D4').status).toBe('unmeasurable');
  });

  it('lep.json の database.storagePath を尊重して DB ディレクトリを解決する', async () => {
    write('.anytime/trail/lep.json', JSON.stringify({ stage: 'all', database: { storagePath: 'custom/db' } }));
    fs.mkdirSync(path.join(sandbox, 'custom', 'db'), { recursive: true });
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: fakeHome });
    expect(facts.dbDir).toEqual({ path: path.join(sandbox, 'custom', 'db'), exists: true });
  });

  it('lep.local.json に置かれた storagePath でも Trail 未導入と誤判定しない', async () => {
    write('.anytime/trail/lep.json', JSON.stringify({ stage: 'all' }));
    write('.anytime/trail/lep.local.json', JSON.stringify({ database: { storagePath: 'local/db' } }));
    fs.mkdirSync(path.join(sandbox, 'local', 'db'), { recursive: true });
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: fakeHome });
    expect(facts.dbDir.exists).toBe(true);
    expect(facts.lep.loadedPaths).toHaveLength(2);
  });

  it('索引ディレクトリが無いワークスペースでは D6 を対象外にする（誤警報ゼロ）', async () => {
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: fakeHome });
    expect(facts.docIndex.markdownDirExists).toBe(false);
    expect(byId(judge(facts), 'D6').status).toBe('not-applicable');
  });
});

describe('readDeclaredDocsRoot', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-docs-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CLAUDE.md の「- docsRoot: <path>」を絶対パスで返す', () => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CLAUDE.md\n\n- docsRoot: /Shared/docs-repo\n');
    expect(readDeclaredDocsRoot(dir)).toBe('/Shared/docs-repo');
  });

  it('CLAUDE.md が無ければ null', () => {
    expect(readDeclaredDocsRoot(dir)).toBeNull();
  });
});
