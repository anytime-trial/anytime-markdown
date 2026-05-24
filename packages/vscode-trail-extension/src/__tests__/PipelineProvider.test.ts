// fs モック
const mockExistsSync = jest.fn().mockReturnValue(false);
const mockReadFileSync = jest.fn();
const mockStatSync = jest.fn();
jest.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

import {
  PipelineProvider,
  PipelineItem,
  formatDuration,
  formatPipelineDescription,
  buildBackupDisplay,
  buildImportAllPhaseDisplay,
  IMPORT_ALL_PHASE_ORDER,
  BACKUP_GROUP_LABEL,
  WAVE2_GROUP_LABEL,
  WAVE3_GROUP_LABEL,
} from '../providers/PipelineProvider';

/** Wave グループ (親) を label で取得する。 */
async function getGroup(provider: PipelineProvider, label: string): Promise<PipelineItem | undefined> {
  const groups = await provider.getChildren();
  return groups.find((g) => g.label === label);
}

/** 指定 Wave グループ配下の pipeline (子) ノードを返す。 */
async function getGroupChildren(provider: PipelineProvider, label: string): Promise<PipelineItem[]> {
  const group = await getGroup(provider, label);
  return group ? provider.getChildren(group) : Promise.resolve([]);
}

/** 全 Wave グループの pipeline (leaf) ノードを Wave 順に平坦化して返す。 */
async function getAllPipelines(provider: PipelineProvider): Promise<PipelineItem[]> {
  const groups = await provider.getChildren();
  const out: PipelineItem[] = [];
  for (const g of groups) {
    out.push(...(await provider.getChildren(g)));
  }
  return out;
}

describe('PipelineProvider.getChildren() — memory-core pipelines (Wave 3)', () => {
  let provider: PipelineProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('statusFilePath なし + dbFilePath なし: グループも空', async () => {
    provider = new PipelineProvider();
    const groups = await provider.getChildren();
    expect(groups).toEqual([]);
  });

  it('memory-core pipeline 表示: status ファイルを Wave 3 グループ配下に 3 行', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [
        { scope: 'embedding_backfill', state: 'running', started_at: '2026-05-11T22:00:00.000Z', items_processed: 150, items_total: 2484, items_failed: 0 },
        { scope: 'spec_incremental', state: 'success', started_at: '2026-05-11T21:55:00.000Z', finished_at: '2026-05-11T21:56:30.000Z', items_processed: 12, items_failed: 0 },
        { scope: 'drift_detection', state: 'pending' },
      ],
    }));

    provider = new PipelineProvider({ statusFilePath: statusPath });

    // トップレベルは Wave 3 グループ 1 件のみ (dbFilePath/memoryDbFilePath なし)。
    const groups = await provider.getChildren();
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(WAVE3_GROUP_LABEL);

    const children = await getGroupChildren(provider, WAVE3_GROUP_LABEL);
    expect(children).toHaveLength(3);
    expect(children[0].label).toBe('embedding_backfill');
    expect(children[0].description).toMatch(/^150\/2484 \(/);
    expect(children[1].description).toBe('12 done in 1m30s');
    expect(children[2].description).toBe('');
  });

  it('error 状態: message を description に含む', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [
        { scope: 'code_incremental', state: 'error', message: 'tsconfig not found' },
      ],
    }));

    provider = new PipelineProvider({ statusFilePath: statusPath });
    const children = await getGroupChildren(provider, WAVE3_GROUP_LABEL);
    expect(children[0].description).toContain('error');
    expect(children[0].description).toContain('tsconfig not found');
  });
});

describe('PipelineProvider.getChildren() — Wave グルーピング', () => {
  let provider: PipelineProvider;
  const dbFilePath = '/fake/.anytime/trail/db/trail.db';
  const memDbPath = '/fake/.anytime/trail/db/memory-core.db';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('トップレベルは Backup → Wave 2 → Wave 3 の折りたたみ可能な親ノード', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [{ scope: 'embedding_backfill', state: 'pending' }],
    }));

    provider = new PipelineProvider({ statusFilePath: statusPath, dbFilePath, memoryDbFilePath: memDbPath });
    const groups = await provider.getChildren();

    expect(groups.map((g) => g.label)).toEqual([
      BACKUP_GROUP_LABEL,
      WAVE2_GROUP_LABEL,
      WAVE3_GROUP_LABEL,
    ]);
    // 親ノードは kind='group' / Expanded で折りたためる。
    for (const g of groups) {
      expect(g.kind).toBe('group');
      expect(g.collapsibleState).toBe(2 /* TreeItemCollapsibleState.Expanded */);
    }
  });

  it('import_sessions は Wave 2 グループ配下に並ぶ', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });

    const wave2 = await getGroupChildren(provider, WAVE2_GROUP_LABEL);
    expect(wave2.map((c) => c.label)).toEqual([...IMPORT_ALL_PHASE_ORDER]);
    expect(wave2[0].label).toBe('import_sessions');
    expect(wave2[0].kind).toBe('pipeline');
  });

  it('memory-core pipeline は Wave 3 グループ配下に並ぶ', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [{ scope: 'conversation_incremental', state: 'pending' }],
    }));
    provider = new PipelineProvider({ statusFilePath: statusPath, dbFilePath });

    const wave3 = await getGroupChildren(provider, WAVE3_GROUP_LABEL);
    expect(wave3.map((c) => c.label)).toContain('conversation_incremental');
  });
});

describe('PipelineProvider.getChildren() — backup pipeline entry', () => {
  let provider: PipelineProvider;
  const dbFilePath = '/fake/.anytime/trail/db/trail.db';
  const bakPath = `${dbFilePath}.bak.1.gz`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('dbFilePath なし: Backup グループを表示しない', async () => {
    provider = new PipelineProvider();
    const group = await getGroup(provider, BACKUP_GROUP_LABEL);
    expect(group).toBeUndefined();
  });

  it('dbFilePath あり / .bak.1.gz 不在: Backup グループ配下 trail.db が pending "未作成"', async () => {
    mockExistsSync.mockReturnValue(false);

    provider = new PipelineProvider({ dbFilePath });
    const backupChildren = await getGroupChildren(provider, BACKUP_GROUP_LABEL);

    expect(backupChildren).toHaveLength(1);
    expect(backupChildren[0].label).toBe('trail.db');
    expect(backupChildren[0].description).toBe('未作成');
  });

  it('dbFilePath あり / .bak.1.gz 存在: success state でサイズ + mtime 表示', async () => {
    mockExistsSync.mockImplementation((p: string) => p === bakPath);
    const fakeMtime = new Date('2026-05-16T10:23:45.000Z');
    mockStatSync.mockReturnValue({ size: 12_897_280, mtime: fakeMtime });

    provider = new PipelineProvider({ dbFilePath });
    const backupChildren = await getGroupChildren(provider, BACKUP_GROUP_LABEL);

    expect(backupChildren[0].label).toBe('trail.db');
    expect(backupChildren[0].description).toContain('12.3 MB');
    expect(backupChildren[0].description).toContain(fakeMtime.toLocaleString());
  });

  it('表示順: Backup[trail.db] → Wave 2[8 phases] → Wave 3[memory pipelines]', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath || p === bakPath);
    mockStatSync.mockReturnValue({ size: 1024, mtime: new Date() });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [
        { scope: 'embedding_backfill', state: 'success', started_at: '2026-05-11T22:00:00.000Z', finished_at: '2026-05-11T22:01:00.000Z', items_processed: 10, items_failed: 0 },
      ],
    }));

    provider = new PipelineProvider({ statusFilePath: statusPath, dbFilePath });

    const groups = await provider.getChildren();
    expect(groups.map((g) => g.label)).toEqual([
      BACKUP_GROUP_LABEL,
      WAVE2_GROUP_LABEL,
      WAVE3_GROUP_LABEL,
    ]);
    expect((await getGroupChildren(provider, BACKUP_GROUP_LABEL)).map((c) => c.label)).toEqual(['trail.db']);
    expect((await getGroupChildren(provider, WAVE2_GROUP_LABEL)).map((c) => c.label)).toEqual([...IMPORT_ALL_PHASE_ORDER]);
    expect((await getGroupChildren(provider, WAVE3_GROUP_LABEL)).map((c) => c.label)).toEqual(['embedding_backfill']);
  });

  it('memoryDbFilePath あり / .bak.1.gz 不在: memory backup を Wave 3 配下に pending 表示', async () => {
    const memDbPath = '/fake/.anytime/trail/db/memory-core.db';
    mockExistsSync.mockReturnValue(false);

    provider = new PipelineProvider({ memoryDbFilePath: memDbPath });
    const wave3 = await getGroupChildren(provider, WAVE3_GROUP_LABEL);

    const memBackup = wave3.find((c) => c.label === 'memory backup');
    expect(memBackup).toBeDefined();
    expect(memBackup?.description).toBe('未作成');
  });

  it('memoryDbFilePath あり / .bak.1.gz 存在: success state でサイズ + mtime 表示', async () => {
    const memDbPath = '/fake/.anytime/trail/db/memory-core.db';
    const memBakPath = `${memDbPath}.bak.1.gz`;
    mockExistsSync.mockImplementation((p: string) => p === memBakPath);
    const fakeMtime = new Date('2026-05-17T03:00:00.000Z');
    mockStatSync.mockReturnValue({ size: 524_288, mtime: fakeMtime });

    provider = new PipelineProvider({ memoryDbFilePath: memDbPath });
    const wave3 = await getGroupChildren(provider, WAVE3_GROUP_LABEL);

    const memBackup = wave3.find((c) => c.label === 'memory backup');
    expect(memBackup).toBeDefined();
    expect(memBackup?.description).toContain('0.5 MB');
    expect(memBackup?.description).toContain(fakeMtime.toLocaleString());
  });

  it('Wave 3 内の順: memory backup → memory pipelines', async () => {
    const statusPath = '/fake/pipeline-status.json';
    const memDbPath = '/fake/.anytime/trail/db/memory-core.db';
    const memBakPath = `${memDbPath}.bak.1.gz`;
    mockExistsSync.mockImplementation(
      (p: string) => p === statusPath || p === bakPath || p === memBakPath,
    );
    mockStatSync.mockReturnValue({ size: 1024, mtime: new Date() });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-11T22:00:00.000Z',
      run_id: 'r1',
      pipelines: [
        { scope: 'embedding_backfill', state: 'success', started_at: '2026-05-11T22:00:00.000Z', finished_at: '2026-05-11T22:01:00.000Z', items_processed: 10, items_failed: 0 },
      ],
    }));

    provider = new PipelineProvider({
      statusFilePath: statusPath,
      dbFilePath,
      memoryDbFilePath: memDbPath,
    });

    const wave3 = await getGroupChildren(provider, WAVE3_GROUP_LABEL);
    expect(wave3.map((c) => c.label)).toEqual(['memory backup', 'embedding_backfill']);
  });
});

describe('PipelineProvider — importAll phase entries (in-process)', () => {
  let provider: PipelineProvider;
  const dbFilePath = '/fake/.anytime/trail/db/trail.db';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('未追跡: 全 8 phase が pending state + "未実行" で表示', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    const children = await getAllPipelines(provider);

    for (const ph of IMPORT_ALL_PHASE_ORDER) {
      const item = children.find((c) => c.label === ph);
      expect(item).toBeDefined();
      expect(item?.description).toBe('未実行');
    }
  });

  it('setImportAllPhase("import_sessions", "start"): 当該 phase のみ running', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    provider.setImportAllPhase('import_sessions', 'start');
    const children = await getAllPipelines(provider);

    const running = children.find((c) => c.label === 'import_sessions');
    expect(running?.description).toMatch(/^running/);
    const other = children.find((c) => c.label === 'resolve_releases');
    expect(other?.description).toBe('未実行');
  });

  it('setImportAllPhase("resolve_releases", "finish", { count: 5 }): success + "5 done in Xs"', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    provider.setImportAllPhase('resolve_releases', 'start');
    provider.setImportAllPhase('resolve_releases', 'finish', { count: 5 });
    const children = await getAllPipelines(provider);

    const item = children.find((c) => c.label === 'resolve_releases');
    expect(item?.description).toMatch(/^5 done/);
  });

  it('setImportAllPhase("analyze_releases", "skip"): skipped state', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    provider.setImportAllPhase('analyze_releases', 'skip', { message: 'no gitRoot' });
    const children = await getAllPipelines(provider);

    const item = children.find((c) => c.label === 'analyze_releases');
    expect(item?.description).toBe('skipped: no gitRoot');
  });

  it('setImportAllPhase("backfill", "error"): error state + メッセージ', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    provider.setImportAllPhase('backfill', 'error', { message: 'git not found' });
    const children = await getAllPipelines(provider);

    const item = children.find((c) => c.label === 'backfill');
    expect(item?.description).toContain('error');
    expect(item?.description).toContain('git not found');
  });

  it('resetImportAllPhases: 全 phase が pending に戻る', async () => {
    mockExistsSync.mockReturnValue(false);
    provider = new PipelineProvider({ dbFilePath });
    provider.setImportAllPhase('import_sessions', 'finish', { count: 10 });
    provider.setImportAllPhase('resolve_releases', 'finish', { count: 3 });
    provider.resetImportAllPhases();
    const children = await getAllPipelines(provider);

    for (const ph of IMPORT_ALL_PHASE_ORDER) {
      const item = children.find((c) => c.label === ph);
      expect(item?.description).toBe('未実行');
    }
  });
});

describe('PipelineProvider — importAll status file polling', () => {
  let provider: PipelineProvider;
  const dbFilePath = '/fake/.anytime/trail/db/trail.db';
  const importAllStatusFilePath = '/fake/.anytime/trail/db/importall-phase-status.json';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('importAllStatusFile を読み込んで _importAllPhases に反映する', async () => {
    let mtimeCounter = 1000;
    mockExistsSync.mockImplementation((p: string) => p === importAllStatusFilePath);
    mockStatSync.mockImplementation(() => ({ mtimeMs: mtimeCounter++, mtime: new Date() }));
    mockReadFileSync.mockReturnValue(JSON.stringify({
      updated_at: '2026-05-16T10:00:00.000Z',
      run_id: 'daemon-run-1',
      phases: {
        import_sessions: { state: 'success', startedAt: '2026-05-16T10:00:00.000Z', finishedAt: '2026-05-16T10:00:10.000Z', count: 42 },
        resolve_releases: { state: 'running', startedAt: '2026-05-16T10:00:10.000Z' },
      },
    }));

    provider = new PipelineProvider({ dbFilePath, importAllStatusFilePath });
    (provider as unknown as { _checkStatusFile(): void })._checkStatusFile();
    const children = await getAllPipelines(provider);

    const importSessions = children.find((c) => c.label === 'import_sessions');
    expect(importSessions?.description).toMatch(/^42 done/);
    const resolveReleases = children.find((c) => c.label === 'resolve_releases');
    expect(resolveReleases?.description).toMatch(/^running/);
  });

  it('run_id が変わると前回 phase 状態をクリアする', async () => {
    let mtimeCounter = 1000;
    mockExistsSync.mockImplementation((p: string) => p === importAllStatusFilePath);
    mockStatSync.mockImplementation(() => ({ mtimeMs: mtimeCounter++, mtime: new Date() }));

    provider = new PipelineProvider({ dbFilePath, importAllStatusFilePath });

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      updated_at: '2026-05-16T10:00:00.000Z',
      run_id: 'A',
      phases: {
        import_sessions: { state: 'success', count: 10 },
        resolve_releases: { state: 'success', count: 3 },
      },
    }));
    (provider as unknown as { _checkStatusFile(): void })._checkStatusFile();
    let children = await getAllPipelines(provider);
    expect(children.find((c) => c.label === 'import_sessions')?.description).toMatch(/^10 done/);

    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      updated_at: '2026-05-16T10:30:00.000Z',
      run_id: 'B',
      phases: {
        import_sessions: { state: 'running' },
      },
    }));
    (provider as unknown as { _checkStatusFile(): void })._checkStatusFile();
    children = await getAllPipelines(provider);
    expect(children.find((c) => c.label === 'import_sessions')?.description).toMatch(/^running/);
    expect(children.find((c) => c.label === 'resolve_releases')?.description).toBe('未実行');
  });
});

describe('helper functions', () => {
  it('formatDuration: 秒/分/時の境界', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(90)).toBe('1m30s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3660)).toBe('1h1m');
    expect(formatDuration(-1)).toBe('');
  });

  it('formatPipelineDescription: running 経過時間 + ETA を含む', () => {
    const now = new Date('2026-05-11T22:10:00.000Z').getTime();
    const desc = formatPipelineDescription(
      {
        scope: 'embedding_backfill',
        state: 'running',
        started_at: '2026-05-11T22:00:00.000Z',
        items_processed: 100,
        items_total: 1000,
        items_failed: 0,
      },
      now,
    );
    expect(desc).toContain('100/1000');
    expect(desc).toContain('10m');
    expect(desc).toContain('~1h30m left');
  });

  it('formatPipelineDescription: success 完了時間表示', () => {
    const desc = formatPipelineDescription({
      scope: 'spec_incremental',
      state: 'success',
      started_at: '2026-05-11T22:00:00.000Z',
      finished_at: '2026-05-11T22:05:00.000Z',
      items_processed: 12,
      items_failed: 0,
    });
    expect(desc).toBe('12 done in 5m');
  });
});

describe('buildBackupDisplay()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('不在 → pending / 未作成', () => {
    mockExistsSync.mockReturnValue(false);
    expect(buildBackupDisplay('/tmp/trail.db')).toEqual({
      scope: 'backup',
      state: 'pending',
      description: '未作成',
    });
  });

  it('存在 → success / size + mtime', () => {
    mockExistsSync.mockReturnValue(true);
    const mtime = new Date('2026-05-16T10:00:00.000Z');
    mockStatSync.mockReturnValue({ size: 5 * 1024 * 1024, mtime });
    const result = buildBackupDisplay('/tmp/trail.db');
    expect(result.scope).toBe('backup');
    expect(result.state).toBe('success');
    expect(result.description).toContain('5.0 MB');
  });

  it('I/O エラー → error / メッセージ切り詰め', () => {
    mockExistsSync.mockImplementation(() => { throw new Error('ENOMEM something'); });
    const result = buildBackupDisplay('/tmp/trail.db');
    expect(result.state).toBe('error');
    expect(result.description).toContain('ENOMEM');
  });
});

describe('buildImportAllPhaseDisplay()', () => {
  it('null → pending / 未実行', () => {
    expect(buildImportAllPhaseDisplay('import_sessions', null)).toEqual({
      scope: 'import_sessions',
      state: 'pending',
      description: '未実行',
    });
  });

  it('running with startedAt → 経過時間付き', () => {
    const now = new Date('2026-05-16T10:05:00.000Z').getTime();
    const result = buildImportAllPhaseDisplay(
      'analyze_releases',
      { state: 'running', startedAt: '2026-05-16T10:00:00.000Z' },
      now,
    );
    expect(result.state).toBe('running');
    expect(result.description).toContain('running');
    expect(result.description).toContain('5m');
  });

  it('success with count + duration → "N done in Xs"', () => {
    const result = buildImportAllPhaseDisplay('import_sessions', {
      state: 'success',
      startedAt: '2026-05-16T10:00:00.000Z',
      finishedAt: '2026-05-16T10:00:30.000Z',
      count: 7,
    });
    expect(result.state).toBe('success');
    expect(result.description).toBe('7 done in 30s');
  });

  it('success without count → "done in Xs"', () => {
    const result = buildImportAllPhaseDisplay('rebuild_costs', {
      state: 'success',
      startedAt: '2026-05-16T10:00:00.000Z',
      finishedAt: '2026-05-16T10:00:30.000Z',
    });
    expect(result.description).toBe('done in 30s');
  });

  it('skipped with message → "skipped: msg"', () => {
    const result = buildImportAllPhaseDisplay('analyze_releases', {
      state: 'skipped',
      message: 'no gitRoot',
    });
    expect(result.state).toBe('skipped');
    expect(result.description).toBe('skipped: no gitRoot');
  });

  it('error with long message → "error: msg" (60 文字切り詰め)', () => {
    const result = buildImportAllPhaseDisplay('backfill', {
      state: 'error',
      message: 'a'.repeat(120),
    });
    expect(result.state).toBe('error');
    expect(result.description.length).toBeLessThanOrEqual('error: '.length + 60);
  });
});
