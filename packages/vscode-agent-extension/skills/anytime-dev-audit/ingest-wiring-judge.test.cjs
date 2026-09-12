const { judge, summarize, hoursBetween, STALE_HOURS, SKIP_STREAK } = require('./ingest-wiring-judge.cjs');

const NOW = '2026-09-12T12:00:00.000Z';

/** 4 領域すべてが正常な facts。各テストは必要な部分だけを差し替える。 */
function healthyFacts(overrides = {}) {
  return {
    workspaceRoot: '/ws',
    now: NOW,
    dbDir: { path: '/ws/.anytime/trail/db', exists: true },
    lep: {
      candidates: ['/home/u/.anytime/trail/lep.json', '/ws/.anytime/trail/lep.json'],
      loadedPaths: ['/ws/.anytime/trail/lep.json'],
      config: { stage: 'all', sources: { gitRoots: ['/ws'] } },
    },
    repoName: 'ws',
    watched: [{ path: '/ws', origin: 'workspaceFolder', exists: true, isGitWorkTree: true }],
    watchedOverriddenBySetting: false,
    git: { headCommittedAt: '2026-09-12T11:00:00.000Z' },
    ingest: { status: 'ok', lastCommittedAt: '2026-09-12T11:30:00.000Z', scope: 'repo=ws' },
    pipelines: {
      status: 'ok',
      scopes: [{ scope: 'code_incremental', skipStreak: 0, sampled: 50, reasonCodes: [], samples: [] }],
    },
    llm: [{ provider: 'ollama', baseUrl: 'http://host.docker.internal:11434', status: 'ok', detail: 'HTTP 200' }],
    inContainer: true,
    declaredDocsRoot: null,
    docIndex: {
      docsRoot: '/ws/docs',
      catalogDbPath: '/ws/.anytime/markdown/catalog.db',
      catalogExists: true,
      markdownDirExists: true,
    },
    referencedPaths: [{ origin: 'workspaceFolder', path: '/ws', exists: true }],
    ...overrides,
  };
}

const byId = (findings, id) => findings.find((f) => f.id === id);

describe('受け入れ条件（依頼書 §3.4）', () => {
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
      }),
    );
    expect(byId(findings, 'D1')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('実在しない: /Shared/anytime-trade-tmp');
    expect(byId(findings, 'D2')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(summarize(findings).error).toBe(2);
  });

  it('1.2 の状態（docsRoot が空・索引ディレクトリはある）で D6 が warn として出る', () => {
    const findings = judge(
      healthyFacts({
        docIndex: {
          docsRoot: '',
          catalogDbPath: '/ws/.anytime/markdown/catalog.db',
          catalogExists: false,
          markdownDirExists: true,
        },
      }),
    );
    expect(byId(findings, 'D6')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D6').detail).toContain('anytimeMarkdown.docsRoot が空');
  });

  it('1.3 の状態（LLM 不達＋恒常 skip）で D3 と D4 が warn として出る', () => {
    const findings = judge(
      healthyFacts({
        pipelines: {
          status: 'ok',
          scopes: [
            {
              scope: 'conversation_incremental',
              skipStreak: SKIP_STREAK,
              sampled: SKIP_STREAK,
              reasonCodes: ['llm_unavailable'],
              samples: ['skipped: llm_unavailable — ollama unreachable'],
            },
          ],
        },
        llm: [{ provider: 'ollama', baseUrl: 'http://localhost:11434', status: 'unreachable', detail: 'ECONNREFUSED' }],
      }),
    );
    expect(byId(findings, 'D3')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D3').detail).toContain('llm_unavailable');
    expect(byId(findings, 'D4')).toMatchObject({ severity: 'warn', status: 'fired' });
    expect(byId(findings, 'D4').detail).toContain('host.docker.internal を推奨');
  });

  it('1.4 の状態（stage が大文字）で D5 が warn として出て、正しい値を示す', () => {
    const findings = judge(
      healthyFacts({ lep: { candidates: [], loadedPaths: ['/ws/.anytime/trail/lep.json'], config: { stage: 'All' } } }),
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

describe('D1 — 監視リポジトリの解決結果', () => {
  it('監視対象が 0 件なら error', () => {
    const findings = judge(healthyFacts({ watched: [] }));
    expect(byId(findings, 'D1')).toMatchObject({ severity: 'error', status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('有効な監視対象が 0 件');
  });

  it('実在するが git working tree でないパスも error（本番も同じく捨てるため）', () => {
    const findings = judge(
      healthyFacts({
        watched: [
          { path: '/ws', origin: 'workspaceFolder', exists: true, isGitWorkTree: true },
          { path: '/tmp/plain-dir', origin: 'lep.sources.gitRoots', exists: true, isGitWorkTree: false },
        ],
      }),
    );
    expect(byId(findings, 'D1')).toMatchObject({ status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('git working tree でない');
  });

  it('自ワークスペースが有効な監視対象に無ければ error（そのコミットは取り込まれない）', () => {
    const findings = judge(
      healthyFacts({
        watched: [{ path: '/other-repo', origin: 'anytimeTrail.workspace.path', exists: true, isGitWorkTree: true }],
      }),
    );
    expect(byId(findings, 'D1')).toMatchObject({ status: 'fired' });
    expect(byId(findings, 'D1').detail).toContain('自身が監視対象に無く');
    expect(byId(findings, 'D1').evidence.workspaceWatched).toBe(false);
  });

  it('自ワークスペースと外部リポジトリを両方監視していれば ok', () => {
    const findings = judge(
      healthyFacts({
        watched: [
          { path: '/other-repo', origin: 'lep.sources.gitRoots', exists: true, isGitWorkTree: true },
          { path: '/ws', origin: 'workspaceFolder', exists: true, isGitWorkTree: true },
        ],
      }),
    );
    expect(byId(findings, 'D1').status).toBe('ok');
  });
});

describe('D2 — 境界と「0 と測定不能の区別」', () => {
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

  it('committed_at が空文字なら「測定不能」で、クラッシュしない（スキーマが空文字を許容する）', () => {
    // CHECK 制約は committed_at = '' を許容するため、全行が空文字なら MAX() は '' を返す。
    const findings = judge(healthyFacts({ ingest: { status: 'ok', lastCommittedAt: '', scope: 'repo=ws' } }));
    expect(byId(findings, 'D2').status).toBe('unmeasurable');
    expect(byId(findings, 'D2').detail).toContain('日時を解釈できない');
  });

  it('now が解釈できない値でもクラッシュせず「測定不能」へ落ちる', () => {
    const findings = judge(healthyFacts({ now: 'yesterday' }));
    expect(byId(findings, 'D2').status).toBe('unmeasurable');
  });

  it('git HEAD の日時が解釈できなければ「測定不能」', () => {
    expect(byId(judge(healthyFacts({ git: { headCommittedAt: 'not-a-date' } })), 'D2').status).toBe('unmeasurable');
  });

  it('DB を読めなければ「測定不能」で、error 件数には数えない', () => {
    const findings = judge(healthyFacts({ ingest: { status: 'unmeasurable', reason: 'sqlite リーダが無い' } }));
    expect(byId(findings, 'D2').status).toBe('unmeasurable');
    expect(summarize(findings)).toMatchObject({ error: 0, unmeasurable: 1 });
  });

  it('git の最新コミットが取れなければ「測定不能」', () => {
    expect(byId(judge(healthyFacts({ git: { headCommittedAt: null } })), 'D2').status).toBe('unmeasurable');
  });
});

describe('D5 — stage', () => {
  const withConfig = (config) => healthyFacts({ lep: { candidates: [], loadedPaths: ['/ws/lep.json'], config } });

  it('stage 未指定は ok（任意項目で内蔵 default が効く設計上の正常形）', () => {
    const findings = judge(withConfig({ sources: { gitRoots: ['/ws'] } }));
    expect(byId(findings, 'D5').status).toBe('ok');
    expect(byId(findings, 'D5').detail).toContain('未指定');
  });

  it('許容値はすべて ok', () => {
    for (const stage of ['disabled', 'sources', 'primary', 'memory', 'primary+memory', 'all']) {
      expect(byId(judge(withConfig({ stage })), 'D5').status).toBe('ok');
    }
  });

  it('許容集合外は warn', () => {
    expect(byId(judge(withConfig({ stage: 'everything' })), 'D5').status).toBe('fired');
  });

  it('lep.json が 1 つも無ければ「測定不能」（不正値と混同しない）', () => {
    const findings = judge(
      healthyFacts({ lep: { candidates: ['/ws/.anytime/trail/lep.json'], loadedPaths: [], config: null } }),
    );
    expect(byId(findings, 'D5').status).toBe('unmeasurable');
  });

  it('解決元のファイルを所見へ併記する', () => {
    const findings = judge(
      healthyFacts({
        lep: { candidates: [], loadedPaths: ['/home/u/lep.json', '/ws/lep.local.json'], config: { stage: 'all' } },
      }),
    );
    expect(byId(findings, 'D5').detail).toContain('/ws/lep.local.json');
  });
});

describe('D6 — ドキュメント索引', () => {
  const withDocIndex = (docIndex) => healthyFacts({ docIndex: { catalogDbPath: '/ws/.anytime/markdown/catalog.db', ...docIndex } });

  it('索引機能を使っていないワークスペース（docsRoot 空かつ .anytime/markdown 無し）は対象外', () => {
    const findings = judge(withDocIndex({ docsRoot: '', catalogExists: false, markdownDirExists: false }));
    expect(byId(findings, 'D6').status).toBe('not-applicable');
    expect(summarize(findings).warn).toBe(0);
  });

  it('docsRoot はあるが catalog.db が無ければ warn', () => {
    const findings = judge(withDocIndex({ docsRoot: '/ws/docs', catalogExists: false, markdownDirExists: true }));
    expect(byId(findings, 'D6').status).toBe('fired');
  });
});

describe('D7 — 他プロジェクトの設定残骸', () => {
  it('ワークスペース外を指す参照は値と実在有無を併記して warn', () => {
    const findings = judge(
      healthyFacts({
        referencedPaths: [{ origin: 'anytimeTrail.workspace.path', path: '/Shared/anytime-trade-tmp', exists: false }],
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

describe('hoursBetween', () => {
  it('解釈できない日時は null を返す（0 に丸めない）', () => {
    expect(hoursBetween(NOW, '')).toBeNull();
    expect(hoursBetween('yesterday', NOW)).toBeNull();
  });

  it('差を時間で返す', () => {
    expect(hoursBetween('2026-09-12T12:00:00.000Z', '2026-09-12T09:00:00.000Z')).toBe(3);
  });
});
