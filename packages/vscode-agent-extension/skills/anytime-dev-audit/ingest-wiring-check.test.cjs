const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseJsonc,
  readDeclaredDocsRoot,
  mergeSettings,
  resolveWatchedRepoPaths,
  summarizeSkipStreaks,
  judge,
  summarize,
  collectFacts,
  STALE_HOURS,
  SKIP_STREAK,
} = require('./ingest-wiring-check.cjs');

const NOW = '2026-09-12T12:00:00.000Z';

/** 4 領域すべてが正常な facts。各テストは必要な部分だけを差し替える。 */
function healthyFacts(overrides = {}) {
  return {
    workspaceRoot: '/ws',
    now: NOW,
    dbDir: { path: '/ws/.anytime/trail/db', exists: true },
    lep: {
      path: '/ws/.anytime/trail/lep.json',
      exists: true,
      config: { stage: 'all', sources: { gitRoots: ['/ws'] } },
    },
    watched: [{ path: '/ws', origin: 'workspaceFolder', exists: true, isGitWorkTree: true }],
    watchedOverriddenBySetting: false,
    git: { headCommittedAt: '2026-09-12T11:00:00.000Z' },
    ingest: { status: 'ok', lastCommittedAt: '2026-09-12T11:30:00.000Z', scope: 'repo=ws' },
    pipelines: { status: 'ok', scopes: [{ scope: 'code_incremental', skipStreak: 0, sampled: 50, reasons: [] }] },
    llm: [{ provider: 'ollama', baseUrl: 'http://host.docker.internal:11434', status: 'ok', detail: 'HTTP 200' }],
    inContainer: true,
    declaredDocsRoot: null,
    docIndex: { docsRoot: '/ws/docs', catalogDbPath: '/ws/.anytime/markdown/catalog.db', catalogExists: true },
    referencedPaths: [{ origin: 'workspaceFolder', path: '/ws', exists: true }],
    ...overrides,
  };
}

const byId = (findings, id) => findings.find((f) => f.id === id);

describe('parseJsonc', () => {
  it('行コメント・ブロックコメント・末尾カンマを許容する', () => {
    const text = `{
      // 行コメント
      "a": 1, /* ブロック */
      "b": "x",
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: 'x' });
  });

  it('文字列リテラル内の // は除去しない', () => {
    expect(parseJsonc('{"url": "http://example.com"}')).toEqual({ url: 'http://example.com' });
  });

  it('空文字・非文字列は null（未配置の候補ファイルを解析失敗として扱わないため）', () => {
    expect(parseJsonc('')).toBeNull();
    expect(parseJsonc('   ')).toBeNull();
    expect(parseJsonc(null)).toBeNull();
  });

  it('壊れた JSON は null を返す（例外にしない）', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseJsonc('{"a": }')).toBeNull();
    spy.mockRestore();
  });
});

describe('mergeSettings', () => {
  it('Machine → User → ワークスペースの順で後勝ちし、由来ファイルを残す', () => {
    const merged = mergeSettings([
      { scope: 'machine', file: '/m.json', content: '{"anytimeTrail.workspace.path": "/from-machine"}' },
      { scope: 'user', file: '/u.json', content: '{"anytimeTrail.workspace.path": "/from-user"}' },
      { scope: 'workspace', file: '/w.json', content: '{"anytimeTrail.workspace.path": "/from-ws"}' },
    ]);
    expect(merged.values['anytimeTrail.workspace.path']).toEqual({
      value: '/from-ws',
      source: '/w.json',
      scope: 'workspace',
    });
  });

  it('ネスト表記もドット区切りのフラットキーとして引ける', () => {
    const merged = mergeSettings([
      { scope: 'workspace', file: '/w.json', content: '{"anytimeMarkdown": {"docsRoot": "/docs"}}' },
    ]);
    expect(merged.values['anytimeMarkdown.docsRoot'].value).toBe('/docs');
  });

  it('未配置（content=null）の候補は loaded:false として記録し、値には影響しない', () => {
    const merged = mergeSettings([
      { scope: 'machine', file: '/m.json', content: null },
      { scope: 'workspace', file: '/w.json', content: '{"k": 1}' },
    ]);
    expect(merged.files[0]).toEqual({ scope: 'machine', file: '/m.json', loaded: false });
    expect(merged.values.k.value).toBe(1);
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
});

describe('summarizeSkipStreaks', () => {
  const runs = (scope, statuses) =>
    statuses.map((status) => ({ scope, status, error_detail: status === 'skipped' ? 'llm_unavailable' : '' }));

  it('新しい順の先頭から連続する skipped だけを数える', () => {
    const [s] = summarizeSkipStreaks(runs('conversation_incremental', ['skipped', 'skipped', 'success', 'skipped']));
    expect(s.skipStreak).toBe(2);
    expect(s.sampled).toBe(4);
    expect(s.reasons).toEqual(['llm_unavailable']);
  });

  it('先頭が skipped でなければ 0 本', () => {
    const [s] = summarizeSkipStreaks(runs('code_incremental', ['success', 'skipped', 'skipped']));
    expect(s.skipStreak).toBe(0);
  });

  it('scope ごとに分けて連続本数の降順で返す', () => {
    const result = summarizeSkipStreaks([
      ...runs('a', ['success']),
      ...runs('b', ['skipped', 'skipped']),
    ]);
    expect(result.map((s) => s.scope)).toEqual(['b', 'a']);
  });
});

describe('judge — 受け入れ条件（依頼書 §3.4）', () => {
  it('4 項目すべてが正常なワークスペースでは 7 項目のいずれも発火しない', () => {
    const findings = judge(healthyFacts());
    expect(findings.map((f) => f.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(findings.filter((f) => f.status === 'fired')).toEqual([]);
    expect(summarize(findings)).toEqual({ error: 0, warn: 0, unmeasurable: 0, notApplicable: 0 });
  });

  it('1.1 の状態（gitRoots:[] ＋ workspace.path が実在しないパス）で D1 と D2 が error として出る', () => {
    const findings = judge(
      healthyFacts({
        watched: [
          {
            path: '/Shared/anytime-trade-tmp',
            origin: 'anytimeTrail.workspace.path',
            exists: false,
            isGitWorkTree: null,
          },
        ],
        watchedOverriddenBySetting: true,
        ingest: { status: 'ok', lastCommittedAt: '2026-09-01T13:26:00.000Z', scope: 'repo=ws' },
        git: { headCommittedAt: '2026-09-12T11:00:00.000Z' },
      }),
    );
    expect(byId(findings, 'D1')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('実在しない: /Shared/anytime-trade-tmp');
    expect(byId(findings, 'D2')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(summarize(findings).error).toBe(2);
  });

  it('監視対象が 0 件でも D1 は error（取込が一切行われない状態）', () => {
    const findings = judge(healthyFacts({ watched: [] }));
    expect(byId(findings, 'D1')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('監視対象が 0 件');
  });

  it('1.2 の状態（docsRoot が空）で D6 が warn として出る', () => {
    const findings = judge(
      healthyFacts({ docIndex: { docsRoot: '', catalogDbPath: '/ws/.anytime/markdown/catalog.db', catalogExists: false } }),
    );
    expect(byId(findings, 'D6')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D6').detail).toContain('anytimeMarkdown.docsRoot が空');
  });

  it('docsRoot はあるが catalog.db が無い場合も D6 が warn', () => {
    const findings = judge(
      healthyFacts({ docIndex: { docsRoot: '/ws/docs', catalogDbPath: '/ws/.anytime/markdown/catalog.db', catalogExists: false } }),
    );
    expect(byId(findings, 'D6')).toMatchObject({ status: 'fired' });
  });

  it('1.3 の状態（LLM 不達＋恒常 skip）で D3 と D4 が warn として出る', () => {
    const findings = judge(
      healthyFacts({
        pipelines: {
          status: 'ok',
          scopes: [
            { scope: 'conversation_incremental', skipStreak: SKIP_STREAK, sampled: SKIP_STREAK, reasons: ['llm_unavailable'] },
          ],
        },
        llm: [
          { provider: 'ollama', baseUrl: 'http://localhost:11434', status: 'unreachable', detail: 'ECONNREFUSED' },
        ],
      }),
    );
    expect(byId(findings, 'D3')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D3').detail).toContain('llm_unavailable');
    expect(byId(findings, 'D4')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D4').detail).toContain('host.docker.internal を推奨');
  });

  it('1.4 の状態（stage が大文字）で D5 が warn として出て、正しい値を示す', () => {
    const findings = judge(
      healthyFacts({ lep: { path: '/ws/.anytime/trail/lep.json', exists: true, config: { stage: 'All' } } }),
    );
    expect(byId(findings, 'D5')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D5').detail).toContain('正しくは "all"');
  });

  it('.anytime/trail/db が無いワークスペースでは D1〜D5 が「対象外」で error にならない', () => {
    const findings = judge(healthyFacts({ dbDir: { path: '/ws/.anytime/trail/db', exists: false } }));
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5']) {
      expect(byId(findings, id).status).toBe('not-applicable');
    }
    expect(summarize(findings)).toMatchObject({ error: 0, notApplicable: 5 });
  });
});

describe('judge — D2 の境界と「0 と測定不能の区別」', () => {
  const withLag = (hours) =>
    healthyFacts({
      ingest: {
        status: 'ok',
        lastCommittedAt: new Date(Date.parse(NOW) - hours * 3_600_000).toISOString(),
        scope: 'repo=ws',
      },
      git: { headCommittedAt: NOW },
    });

  it(`遅れが ${STALE_HOURS} 時間ちょうどなら発火しない`, () => {
    expect(byId(judge(withLag(STALE_HOURS)), 'D2').status).toBe('ok');
  });

  it(`遅れが ${STALE_HOURS} 時間を超えたら発火する`, () => {
    expect(byId(judge(withLag(STALE_HOURS + 0.5)), 'D2').status).toBe('fired');
  });

  it('遅れていても未取込のコミットが無ければ発火しない（長期間コミットの無いリポジトリ）', () => {
    const facts = withLag(STALE_HOURS + 100);
    facts.git.headCommittedAt = facts.ingest.lastCommittedAt;
    expect(byId(judge(facts), 'D2').status).toBe('ok');
  });

  it('取込 0 件はコミットが存在すれば error（「0」を正常値として扱わない）', () => {
    const findings = judge(healthyFacts({ ingest: { status: 'ok', lastCommittedAt: null, scope: 'repo=ws' } }));
    expect(byId(findings, 'D2')).toMatchObject({ status: 'fired' });
    expect(byId(findings, 'D2').detail).toContain('取込 0 件');
  });

  it('DB を読めなければ「測定不能」で、error 件数には数えない', () => {
    const findings = judge(
      healthyFacts({ ingest: { status: 'unmeasurable', reason: 'sqlite リーダが無い' } }),
    );
    expect(byId(findings, 'D2').status).toBe('unmeasurable');
    expect(summarize(findings)).toMatchObject({ error: 0, unmeasurable: 1 });
  });

  it('git の最新コミットが取れなければ「測定不能」', () => {
    const findings = judge(healthyFacts({ git: { headCommittedAt: null } }));
    expect(byId(findings, 'D2').status).toBe('unmeasurable');
  });
});

describe('judge — D7', () => {
  it('ワークスペース外を指す参照は値と実在有無を併記して warn', () => {
    const findings = judge(
      healthyFacts({
        referencedPaths: [
          { origin: 'anytimeTrail.workspace.path', path: '/Shared/anytime-trade-tmp', exists: false },
        ],
      }),
    );
    expect(byId(findings, 'D7')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D7').detail).toContain('/Shared/anytime-trade-tmp（実在しない）');
  });

  it('CLAUDE.md が宣言した docsRoot と一致する外部パスは残骸として数えない', () => {
    const findings = judge(
      healthyFacts({
        declaredDocsRoot: '/Shared/docs-repo',
        referencedPaths: [{ origin: 'anytimeMarkdown.docsRoot', path: '/Shared/docs-repo', exists: true }],
      }),
    );
    expect(byId(findings, 'D7').status).toBe('ok');
  });
});

describe('collectFacts（実ファイル走査）', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-wiring-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const write = (rel, content) => {
    const file = path.join(sandbox, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };

  it('Trail 未導入のワークスペースは dbDir.exists=false になり、判定は対象外へ落ちる', async () => {
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: sandbox });
    expect(facts.dbDir.exists).toBe(false);
    const findings = judge(facts);
    expect(summarize(findings).error).toBe(0);
    expect(summarize(findings).notApplicable).toBe(5);
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

    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: sandbox });

    expect(facts.watched).toEqual([
      { path: '/nonexistent-repo', origin: 'anytimeTrail.workspace.path', exists: false, isGitWorkTree: null },
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
    const facts = await collectFacts({ workspaceRoot: sandbox, now: NOW, network: false, home: sandbox });
    expect(facts.dbDir).toEqual({ path: path.join(sandbox, 'custom', 'db'), exists: true });
  });
});

describe('readDeclaredDocsRoot', () => {
  it('CLAUDE.md の「- docsRoot: <path>」を絶対パスで返す', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-docs-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CLAUDE.md\n\n- docsRoot: /Shared/docs-repo\n');
      expect(readDeclaredDocsRoot(dir)).toBe('/Shared/docs-repo');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLAUDE.md が無ければ null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-docs-'));
    try {
      expect(readDeclaredDocsRoot(dir)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
