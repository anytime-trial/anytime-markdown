import * as vscode from 'vscode';
import type { TicketProvider } from '@anytime-markdown/tickets-core';

import {
  TicketsPanelManager,
  describeTicketSource,
  isTicketsRpcRequest,
  type PanelContext,
} from '../TicketsPanelManager';
import type { TicketSource } from '../repoResolver';
import { isInitMessage } from '../../webview/tickets/initMessage';

const source: TicketSource = { repo: 'owner/repo', branch: 'main', provider: 'github-contents' };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), dispose: jest.fn() };

describe('describeTicketSource', () => {
  it('branch があれば "repo / branch" 形式にする', () => {
    expect(describeTicketSource({ repo: 'owner/repo', branch: 'main', provider: 'github-contents' })).toBe(
      'owner/repo / main',
    );
  });

  it('branch が空文字列なら repo のみを返す(github-issues は branch を持たない)', () => {
    expect(describeTicketSource({ repo: 'owner/repo', branch: '', provider: 'github-issues' })).toBe('owner/repo');
  });
});

describe('isTicketsRpcRequest', () => {
  it('type/id/method が正しい形の値を受理する', () => {
    expect(isTicketsRpcRequest({ type: 'rpc', id: '1', method: 'list', params: undefined })).toBe(true);
  });

  it('method が未知の値なら拒否する', () => {
    expect(isTicketsRpcRequest({ type: 'rpc', id: '1', method: 'drop-table' })).toBe(false);
  });

  it('id が string でなければ拒否する', () => {
    expect(isTicketsRpcRequest({ type: 'rpc', id: 1, method: 'list' })).toBe(false);
  });

  it('type が rpc 以外なら拒否する', () => {
    expect(isTicketsRpcRequest({ type: 'ready', id: '1', method: 'list' })).toBe(false);
  });

  it('null・配列・プリミティブは拒否する', () => {
    expect(isTicketsRpcRequest(null)).toBe(false);
    expect(isTicketsRpcRequest(undefined)).toBe(false);
    expect(isTicketsRpcRequest([])).toBe(false);
    expect(isTicketsRpcRequest('rpc')).toBe(false);
  });
});

function makeProvider(overrides: Partial<TicketProvider> = {}): TicketProvider {
  return {
    kind: 'github-contents',
    list: jest.fn().mockResolvedValue({ tickets: [], invalid: [] }),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    archive: jest.fn(),
    ...overrides,
  };
}

/** vscode.window.createWebviewPanel が返す WebviewPanel の最小限フェイク。 */
function makeFakePanel() {
  let disposeListener: (() => void) | undefined;
  let messageListener: ((message: unknown) => void) | undefined;
  const postMessage = jest.fn().mockResolvedValue(true);
  return {
    panel: {
      webview: {
        html: '',
        postMessage,
        asWebviewUri: (u: unknown) => u,
        cspSource: 'vscode-webview://cspsource',
        onDidReceiveMessage: (listener: (message: unknown) => void) => {
          messageListener = listener;
          return { dispose: () => {} };
        },
      },
      reveal: jest.fn(),
      onDidDispose: (listener: () => void) => {
        disposeListener = listener;
        return { dispose: () => {} };
      },
    },
    fireMessage: async (message: unknown) => {
      messageListener?.(message);
      // ハンドラは async だが onDidReceiveMessage 自体は void を返す設計のため、テスト側で
      // 内部の Promise チェーン（resolveContext → dispatch → provider 呼び出し → postMessage）が
      // 解決するまで複数 tick 待つ（setImmediate まで待てばマイクロタスクキューは確実に空になる）。
      await new Promise((resolve) => setImmediate(resolve));
    },
    fireDispose: () => disposeListener?.(),
    postMessage,
  };
}

function makeContext(): vscode.ExtensionContext {
  return { extensionUri: { fsPath: '/ext', toString: () => '/ext' } } as unknown as vscode.ExtensionContext;
}

describe('TicketsPanelManager', () => {
  const createWebviewPanel = vscode.window.createWebviewPanel as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('open() は init メッセージを isInitMessage が受理する形で送る(source あり)', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const resolveContext = jest.fn(
      async (): Promise<PanelContext> => ({ source, provider: makeProvider(), currentUser: 'octocat', locale: 'ja' }),
    );
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    await fake.fireMessage({ type: 'ready' });

    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    const sent = fake.postMessage.mock.calls[0][0];
    expect(isInitMessage(sent)).toBe(true);
    expect(sent).toEqual({ type: 'init', source: { label: 'owner/repo / main' }, currentUser: 'octocat', locale: 'ja' });
  });

  it('open() は source が無いとき isInitMessage を通る null source を送る', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const resolveContext = jest.fn(
      async (): Promise<PanelContext> => ({ source: null, provider: null, locale: 'en' }),
    );
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    await fake.fireMessage({ type: 'ready' });

    const sent = fake.postMessage.mock.calls[0][0];
    expect(isInitMessage(sent)).toBe(true);
    expect(sent).toEqual({ type: 'init', source: null, currentUser: undefined, locale: 'en' });
  });

  it('2 回目の open() は新規パネルを作らず reveal して再送する', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const resolveContext = jest.fn(
      async (): Promise<PanelContext> => ({ source, provider: makeProvider(), locale: 'ja' }),
    );
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    await manager.open();

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(fake.panel.reveal).toHaveBeenCalledTimes(1);
  });

  it('不正な RPC メッセージ(method 未知)は無視し warn ログを残す', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const provider = makeProvider();
    const resolveContext = jest.fn(async (): Promise<PanelContext> => ({ source, provider, locale: 'ja' }));
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    fake.postMessage.mockClear();
    await fake.fireMessage({ type: 'rpc', id: '1', method: 'drop-table', params: {} });

    expect(provider.list).not.toHaveBeenCalled();
    expect(fake.postMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('不正な RPC メッセージ'));
  });

  it('provider が無い(未認証)状態で rpc を受けると 401 エラー応答を返す', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const resolveContext = jest.fn(async (): Promise<PanelContext> => ({ source, provider: null, locale: 'ja' }));
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    fake.postMessage.mockClear();
    await fake.fireMessage({ type: 'rpc', id: '9', method: 'list', params: {} });

    expect(fake.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rpcResult', id: '9', error: expect.objectContaining({ status: 401 }) }),
    );
  });

  it('正当な rpc メッセージは provider へ委譲し結果を返す', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const provider = makeProvider();
    const resolveContext = jest.fn(async (): Promise<PanelContext> => ({ source, provider, locale: 'ja' }));
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    fake.postMessage.mockClear();
    await fake.fireMessage({ type: 'rpc', id: '3', method: 'list', params: {} });

    expect(provider.list).toHaveBeenCalledWith({ includeArchive: false });
    expect(fake.postMessage).toHaveBeenCalledWith({ type: 'rpcResult', id: '3', result: { tickets: [], invalid: [] } });
  });

  it('resolveContext が reject したら logger.error を呼び、機密を含まない固定文言の rpcResult エラー応答を id 一致で返す', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    const secretToken = 'ghp_supersecretfaketoken1234567890abcd';
    const resolveContext = jest.fn(async (): Promise<PanelContext> => {
      throw new Error(`GitHub API 呼び出しに失敗しました: token=${secretToken}`);
    });
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    fake.postMessage.mockClear();
    await fake.fireMessage({ type: 'rpc', id: '42', method: 'list', params: {} });

    // 1. resolveContext が reject したとき logger.error が呼ばれる（未処理 Promise 拒否として
    // 消えていないことの検証）。
    expect(logger.error).toHaveBeenCalled();

    // 2. 元のリクエストと id が一致する rpcResult エラー応答が webview へ送られる
    // （画面が固まったまま操作不能になるのを防ぐ）。
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    const sent = fake.postMessage.mock.calls[0][0] as {
      type: string;
      id: string;
      error?: { message: string };
    };
    expect(sent.type).toBe('rpcResult');
    expect(sent.id).toBe('42');
    expect(sent.error).toBeDefined();

    // 3. エラーメッセージに機密（トークン相当の文字列）が含まれない（固定の汎用文言のみ）。
    expect(sent.error?.message).not.toContain(secretToken);
  });

  it('resolveContext の await 中にパネルが破棄されたら応答を送らない', async () => {
    const fake = makeFakePanel();
    createWebviewPanel.mockReturnValue(fake.panel);
    let releaseContext: (() => void) | undefined;
    const resolveContext = jest.fn(
      () =>
        new Promise<PanelContext>((resolve) => {
          releaseContext = () => resolve({ source, provider: makeProvider(), locale: 'ja' });
        }),
    );
    const manager = new TicketsPanelManager(makeContext(), logger, resolveContext);

    await manager.open();
    fake.postMessage.mockClear();
    const pending = fake.fireMessage({ type: 'rpc', id: '7', method: 'list', params: {} });
    fake.fireDispose();
    releaseContext?.();
    await pending;

    expect(fake.postMessage).not.toHaveBeenCalled();
  });
});
