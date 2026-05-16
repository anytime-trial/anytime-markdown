import * as vscode from 'vscode';

// child_process.spawn モック (jest.mock は import より先に hoist される)
const mockSpawn = jest.fn(() => ({ unref: jest.fn(), on: jest.fn() }));
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as Parameters<typeof mockSpawn>)),
}));

// fs モック（/.dockerenv 検出 + status ファイル読み込み用）
const mockExistsSync = jest.fn().mockReturnValue(false);
const mockReadFileSync = jest.fn();
const mockStatSync = jest.fn();
jest.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

// fetch モック (Node 18+ built-in を上書き)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof global.fetch;

import { OllamaProvider, formatDuration, formatPipelineDescription, buildBackupDisplay } from '../providers/OllamaProvider';

function makeRunningResponse(models: string[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ models: models.map((name) => ({ name })) }),
  });
}

function makeTimeoutError() {
  return Promise.reject(Object.assign(new Error('abort'), { name: 'AbortError' }));
}

describe('OllamaProvider.getChildren()', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    // 構築時のポーリングが fetch を呼ぶので、デフォルトで stopped 相当を返す
    mockFetch.mockImplementation(() => makeTimeoutError());
    provider = new OllamaProvider();
  });

  afterEach(() => {
    provider.dispose();
  });

  it('Ollama 起動中: ヘッダー(running) + モデル 2 行を返す', async () => {
    mockFetch.mockReturnValue(makeRunningResponse(['bge-m3', 'qwen2.5:7b']));

    const children = await provider.getChildren();

    expect(children).toHaveLength(3);
    expect(children[0].kind).toBe('header');
    expect(children[0].label).toBe('起動中');
    expect(children[1].kind).toBe('model');
    expect(children[1].label).toBe('bge-m3');
    expect(children[2].label).toBe('qwen2.5:7b');
  });

  it('Ollama 停止中（fetch タイムアウト）: ヘッダー(stopped)のみ返す', async () => {
    mockFetch.mockImplementation(() => makeTimeoutError());

    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe('header');
    expect(children[0].label).toBe('停止中');
  });

  it('モデル一覧取得失敗（ok:false）: ヘッダー(running)のみ返す', async () => {
    mockFetch.mockReturnValue(Promise.resolve({ ok: false }));

    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe('header');
    expect(children[0].label).toBe('起動中');
  });

  it('Dev Container 内: localhost 失敗 → host.docker.internal にフォールバックして起動中を検出', async () => {
    mockExistsSync.mockReturnValue(true); // コンテナ内
    // URL で分岐: localhost は失敗、host.docker.internal は成功
    mockFetch.mockImplementation((url: string) =>
      (url as string).includes('host.docker.internal')
        ? makeRunningResponse(['bge-m3'])
        : makeTimeoutError(),
    );

    const children = await provider.getChildren();

    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('http://localhost:11434/api/tags');
    expect(urls).toContain('http://host.docker.internal:11434/api/tags');
    expect(children[0].label).toBe('起動中');
    expect(children[1].label).toBe('bge-m3');
  });
});

describe('OllamaProvider.getChildren() — pipelines', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(() => makeTimeoutError());
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('statusFilePath なし: pipeline 行を表示しない', async () => {
    provider = new OllamaProvider();
    const children = await provider.getChildren();
    expect(children.every((c) => c.kind !== 'pipeline')).toBe(true);
    expect(children.every((c) => c.kind !== 'pipeline-separator')).toBe(true);
  });

  it('status ファイル存在 + running: header + separator + pipeline items を返す', async () => {
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

    provider = new OllamaProvider({ statusFilePath: statusPath });
    const children = await provider.getChildren();

    const pipelineItems = children.filter((c) => c.kind === 'pipeline');
    expect(pipelineItems).toHaveLength(3);
    expect(pipelineItems[0].label).toBe('embedding_backfill');
    // running の description は (elapsed, ETA) を含む — 実時刻依存なので部分一致
    expect(pipelineItems[0].description).toMatch(/^150\/2484 \(/);
    expect(pipelineItems[1].description).toBe('12 done in 1m30s');
    expect(pipelineItems[2].description).toBe('');

    const sep = children.find((c) => c.kind === 'pipeline-separator');
    expect(sep).toBeDefined();
  });

  it('破損 JSON: pipeline 行を表示しない', async () => {
    const statusPath = '/fake/pipeline-status.json';
    mockExistsSync.mockImplementation((p: string) => p === statusPath);
    mockReadFileSync.mockReturnValue('not json {{{');

    provider = new OllamaProvider({ statusFilePath: statusPath });
    const children = await provider.getChildren();
    expect(children.every((c) => c.kind !== 'pipeline')).toBe(true);
  });

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
        started_at: '2026-05-11T22:00:00.000Z', // 10 分前
        items_processed: 100,
        items_total: 1000,
        items_failed: 0,
      },
      now,
    );
    // 100/1000 で 10 分経過 → 残り 900 件分の時間 = 90 分
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

    provider = new OllamaProvider({ statusFilePath: statusPath });
    const children = await provider.getChildren();
    const p = children.find((c) => c.kind === 'pipeline');
    expect(p?.description).toContain('error');
    expect(p?.description).toContain('tsconfig not found');
  });
});

describe('OllamaProvider.getChildren() — backup pipeline entry', () => {
  let provider: OllamaProvider;
  const dbFilePath = '/fake/.anytime/trail/db/trail.db';
  const bakPath = `${dbFilePath}.bak.1.gz`;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(() => makeTimeoutError());
  });

  afterEach(() => {
    provider?.dispose();
  });

  it('dbFilePath なし: backup エントリを表示しない', async () => {
    provider = new OllamaProvider();
    const children = await provider.getChildren();
    expect(children.find((c) => c.label === 'backup')).toBeUndefined();
  });

  it('dbFilePath あり / .bak.1.gz 不在: pending state で "未作成" 表示', async () => {
    mockExistsSync.mockReturnValue(false);

    provider = new OllamaProvider({ dbFilePath });
    const children = await provider.getChildren();

    const sep = children.find((c) => c.kind === 'pipeline-separator');
    expect(sep).toBeDefined();
    const backup = children.find((c) => c.kind === 'pipeline' && c.label === 'backup');
    expect(backup).toBeDefined();
    expect(backup?.description).toBe('未作成');
  });

  it('dbFilePath あり / .bak.1.gz 存在: success state でサイズ + mtime 表示', async () => {
    mockExistsSync.mockImplementation((p: string) => p === bakPath);
    const fakeMtime = new Date('2026-05-16T10:23:45.000Z');
    mockStatSync.mockReturnValue({ size: 12_897_280, mtime: fakeMtime });

    provider = new OllamaProvider({ dbFilePath });
    const children = await provider.getChildren();

    const backup = children.find((c) => c.kind === 'pipeline' && c.label === 'backup');
    expect(backup).toBeDefined();
    expect(backup?.description).toContain('12.3 MB');
    expect(backup?.description).toContain(fakeMtime.toLocaleString());
  });

  it('backup エントリは Pipelines セクションの先頭に出る (memory-core pipelines より前)', async () => {
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

    provider = new OllamaProvider({ statusFilePath: statusPath, dbFilePath });
    const children = await provider.getChildren();

    const pipelineItems = children.filter((c) => c.kind === 'pipeline');
    expect(pipelineItems).toHaveLength(2);
    expect(pipelineItems[0].label).toBe('backup');
    expect(pipelineItems[1].label).toBe('embedding_backfill');
  });

  it('statSync が throw: error state でメッセージを切り詰めて表示', async () => {
    mockExistsSync.mockImplementation((p: string) => p === bakPath);
    mockStatSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

    provider = new OllamaProvider({ dbFilePath });
    const children = await provider.getChildren();

    const backup = children.find((c) => c.kind === 'pipeline' && c.label === 'backup');
    expect(backup).toBeDefined();
    expect(backup?.description).toContain('EACCES');
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

describe('OllamaProvider.startOllama()', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation(() => makeTimeoutError());
    provider = new OllamaProvider();
  });

  afterEach(() => {
    provider.dispose();
  });

  it('既に起動中なら informationMessage を表示して spawn しない', async () => {
    mockFetch.mockReturnValue(makeRunningResponse(['bge-m3']));

    await provider.startOllama();

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Ollama は既に起動しています。',
    );
  });

  it('停止中なら spawn を呼び出す', async () => {
    mockFetch.mockImplementation(() => makeTimeoutError());

    await provider.startOllama();

    expect(mockSpawn).toHaveBeenCalledWith('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
  });

  it('ENOENT かつコンテナ外: 通常のインストール確認メッセージを表示', async () => {
    mockFetch.mockImplementation(() => makeTimeoutError());
    mockExistsSync.mockReturnValue(false); // /.dockerenv なし

    const enoentErr = new Error('spawn ollama ENOENT') as NodeJS.ErrnoException;
    enoentErr.code = 'ENOENT';
    mockSpawn.mockImplementationOnce(() => ({
      unref: jest.fn(),
      on: jest.fn().mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') { cb(enoentErr); }
      }),
    }));

    await provider.startOllama();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'ollama コマンドが見つかりません。インストールを確認してください。',
    );
  });

  it('ENOENT かつ Dev Container 内: WSL ターミナル案内メッセージを表示', async () => {
    mockFetch.mockImplementation(() => makeTimeoutError());
    mockExistsSync.mockReturnValue(true); // /.dockerenv あり = コンテナ内

    const enoentErr = new Error('spawn ollama ENOENT') as NodeJS.ErrnoException;
    enoentErr.code = 'ENOENT';
    mockSpawn.mockImplementationOnce(() => ({
      unref: jest.fn(),
      on: jest.fn().mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') { cb(enoentErr); }
      }),
    }));

    await provider.startOllama();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Dev Container 内では ollama を直接起動できません。WSL ターミナルで `ollama serve` を実行してください。',
    );
  });
});
