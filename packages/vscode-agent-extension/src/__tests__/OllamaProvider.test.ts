import * as vscode from 'vscode';

// child_process.spawn モック (jest.mock は import より先に hoist される)
const mockSpawn = jest.fn(() => ({ unref: jest.fn(), on: jest.fn() }));
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as Parameters<typeof mockSpawn>)),
}));

// fs モック (/.dockerenv 検出 + throttle-status.json 読込用)
const mockExistsSync = jest.fn().mockReturnValue(false);
const mockReadFileSync = jest.fn();
jest.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

// fetch モック (Node 18+ built-in を上書き)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof global.fetch;

import { OllamaProvider } from '../providers/OllamaProvider';

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

  // getChildren は _status をキャッシュ参照する設計のため、テストでは mockFetch 設定後に
  // _poll() を明示的に呼んで _status をリフレッシュしてから getChildren を呼ぶ。
  const refreshStatus = async (): Promise<void> => {
    await (provider as unknown as { _poll(): Promise<void> })._poll();
  };

  it('Ollama 起動中: ヘッダー(running) + モデル 2 行を返す', async () => {
    mockFetch.mockReturnValue(makeRunningResponse(['bge-m3', 'qwen2.5:7b']));
    await refreshStatus();

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
    await refreshStatus();

    const children = await provider.getChildren();

    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe('header');
    expect(children[0].label).toBe('停止中');
  });

  it('モデル一覧取得失敗（ok:false）: ヘッダー(running)のみ返す', async () => {
    mockFetch.mockReturnValue(Promise.resolve({ ok: false }));
    await refreshStatus();

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
    await refreshStatus();

    const children = await provider.getChildren();

    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('http://localhost:11434/api/tags');
    expect(urls).toContain('http://host.docker.internal:11434/api/tags');
    expect(children[0].label).toBe('起動中');
    expect(children[1].label).toBe('bge-m3');
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

    let errHandler: ((err: Error) => void) | undefined;
    mockSpawn.mockImplementation(() => ({
      unref: jest.fn(),
      on: jest.fn((event: string, h: (err: Error) => void) => {
        if (event === 'error') errHandler = h;
      }),
    }) as unknown as ReturnType<typeof mockSpawn>);

    await provider.startOllama();
    errHandler?.(enoentErr);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'ollama コマンドが見つかりません。インストールを確認してください。',
    );
  });

  it('ENOENT かつ Dev Container 内: WSL ターミナル案内メッセージを表示', async () => {
    mockFetch.mockImplementation(() => makeTimeoutError());
    mockExistsSync.mockReturnValue(true);

    const enoentErr = new Error('spawn ollama ENOENT') as NodeJS.ErrnoException;
    enoentErr.code = 'ENOENT';

    let errHandler: ((err: Error) => void) | undefined;
    mockSpawn.mockImplementation(() => ({
      unref: jest.fn(),
      on: jest.fn((event: string, h: (err: Error) => void) => {
        if (event === 'error') errHandler = h;
      }),
    }) as unknown as ReturnType<typeof mockSpawn>);

    await provider.startOllama();
    errHandler?.(enoentErr);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Dev Container 内では ollama を直接起動できません。WSL ターミナルで `ollama serve` を実行してください。',
    );
  });
});

describe('OllamaProvider throttle rows', () => {
  const THROTTLE_PATH = '/ws/.anytime/trail/db/throttle-status.json';

  function freshThrottle(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      enabled: true,
      state: 'NORMAL',
      entries: [{ op: 'embeddings', model: 'bge-m3:latest', lastLatencyMs: 245, ewmaMs: 198, count: 9 }],
      updatedAt: new Date().toISOString(),
      ...overrides,
    });
  }

  async function buildChildren(
    fileBehavior: () => string,
  ): Promise<{ kind: string; label: string; description?: string }[]> {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [{ name: 'bge-m3:latest' }] }) }),
    );
    mockReadFileSync.mockImplementation(fileBehavior);
    const provider = new OllamaProvider(THROTTLE_PATH);
    try {
      await (provider as unknown as { _poll(): Promise<void> })._poll();
      const items = await provider.getChildren();
      return items.map((i) => ({
        kind: i.kind,
        label: String(i.label),
        description: typeof i.description === 'string' ? i.description : undefined,
      }));
    } finally {
      provider.dispose();
    }
  }

  it('inserts throttle state + embeddings rows after the header when fresh', async () => {
    const rows = await buildChildren(() => freshThrottle());
    expect(rows[0].kind).toBe('header');
    expect(rows[1].kind).toBe('throttle');
    expect(rows[1].description).toBe('NORMAL');
    expect(rows[2].kind).toBe('throttle');
    expect(rows[2].label).toBe('embeddings');
    expect(rows[2].description).toContain('直近 245ms');
    expect(rows[2].description).toContain('基準 198ms');
    expect(rows[2].description).toContain('×1.24');
  });

  it('omits throttle rows when the file is stale', async () => {
    const stale = freshThrottle({ updatedAt: new Date(Date.now() - 120_000).toISOString() });
    const rows = await buildChildren(() => stale);
    expect(rows.some((r) => r.kind === 'throttle')).toBe(false);
  });

  it('omits throttle rows when the file is absent (ENOENT)', async () => {
    const rows = await buildChildren(() => {
      throw Object.assign(new Error('no file'), { code: 'ENOENT' });
    });
    expect(rows.some((r) => r.kind === 'throttle')).toBe(false);
  });

  it('omits throttle rows when throttle is disabled', async () => {
    const rows = await buildChildren(() => freshThrottle({ enabled: false }));
    expect(rows.some((r) => r.kind === 'throttle')).toBe(false);
  });

  it('marks the baseline provisional when count < 5', async () => {
    const rows = await buildChildren(() =>
      freshThrottle({ entries: [{ op: 'embeddings', model: 'bge-m3:latest', lastLatencyMs: 245, ewmaMs: 198, count: 3 }] }),
    );
    const embeddings = rows.find((r) => r.label === 'embeddings');
    expect(embeddings?.description).toContain('(測定中)');
  });
});
