import * as vscode from 'vscode';

// child_process.spawn モック (jest.mock は import より先に hoist される)
const mockSpawn = jest.fn(() => ({ unref: jest.fn(), on: jest.fn() }));
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as Parameters<typeof mockSpawn>)),
}));

// fs.existsSync モック（/.dockerenv 検出用）
const mockExistsSync = jest.fn().mockReturnValue(false);
jest.mock('node:fs', () => ({ existsSync: (...args: unknown[]) => mockExistsSync(...args) }));

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
    mockFetch.mockReturnValue(makeTimeoutError());
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
    mockFetch.mockReturnValue(makeTimeoutError());

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

describe('OllamaProvider.startOllama()', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReturnValue(makeTimeoutError());
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
    mockFetch.mockReturnValue(makeTimeoutError());

    await provider.startOllama();

    expect(mockSpawn).toHaveBeenCalledWith('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
  });

  it('ENOENT かつコンテナ外: 通常のインストール確認メッセージを表示', async () => {
    mockFetch.mockReturnValue(makeTimeoutError());
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
    mockFetch.mockReturnValue(makeTimeoutError());
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
