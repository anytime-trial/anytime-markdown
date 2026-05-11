import * as vscode from 'vscode';

// child_process.spawn モック (jest.mock は import より先に hoist される)
const mockSpawn = jest.fn(() => ({ unref: jest.fn(), on: jest.fn() }));
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as Parameters<typeof mockSpawn>)),
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

  it('ENOENT の場合は errorMessage を表示して終了', async () => {
    mockFetch.mockReturnValue(makeTimeoutError());
    mockSpawn.mockImplementationOnce(() => {
      const err = new Error('spawn ollama ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    await provider.startOllama();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'ollama コマンドが見つかりません。インストールを確認してください。',
    );
  });
});
