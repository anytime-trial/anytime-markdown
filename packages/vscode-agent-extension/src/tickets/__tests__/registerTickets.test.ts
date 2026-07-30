import * as vscode from 'vscode';

/**
 * git の実行基点（cwd）が**チケットリポジトリ**であることを固定する。
 *
 * ボードはワークスペース自身の origin から repo/branch を推定していたため、
 * 別リポジトリに置かれたチケットを見つけられなかった（実運用でワークスペースは
 * anytime-markdown、チケットは anytime-ticket）。純粋関数 `resolveTicketsRepoRoot`
 * のテストだけでは、その戻り値が実際に `git()` へ渡っているかを保証できない。
 * ここでは配線そのもの（`execFile` に渡る cwd）を検証する。
 */
const execFileMock = jest.fn();
jest.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- モック定義後に読み込む必要がある
const { registerTicketsFeature } = require('../registerTickets') as typeof import('../registerTickets');

const TICKETS_DIR = '/Shared/anytime-ticket';
const WORKSPACE_ROOT = '/ws';

interface GitCall {
  args: string[];
  cwd: string;
}

/** `execFile` へ渡った (args, cwd) を取り出す。promisify 経由なので末尾はコールバック。 */
function gitCalls(): GitCall[] {
  return execFileMock.mock.calls.map((call) => ({
    args: call[1] as string[],
    cwd: (call[2] as { cwd: string }).cwd,
  }));
}

function setup(configured: string): { runSignIn: () => Promise<void> } {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  (vscode.commands.registerCommand as jest.Mock).mockImplementation(
    (id: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(id, handler);
      return { dispose: jest.fn() };
    },
  );
  (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
    get: (key: string) =>
      section === 'anytimeAgent.tickets' && key === 'directory' ? configured : '',
    update: jest.fn(),
  }));
  Object.defineProperty(vscode.workspace, 'workspaceFolders', {
    value: [{ uri: { fsPath: WORKSPACE_ROOT } }],
    configurable: true,
  });
  (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

  // promisify(execFile) の既定ラップはコールバックの第 2 引数を解決値にする。
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (e: unknown, v: unknown) => void;
    const gitArgs = args[1] as string[];
    const stdout = gitArgs.includes('remote')
      ? 'git@github.com:anytime-trial/anytime-ticket.git\n'
      : 'main\n';
    cb(null, { stdout, stderr: '' });
  });

  const context = { subscriptions: [], extensionUri: { fsPath: '/ext' } };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  registerTicketsFeature(context as never, logger);

  const signIn = handlers.get('anytime-agent.tickets.signIn');
  if (!signIn) {
    throw new Error('signIn コマンドが登録されていない（配線が変わった可能性）');
  }
  return { runSignIn: async () => void (await signIn()) };
}

describe('registerTicketsFeature の git 実行基点', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tickets.directory が設定されていればそこを cwd にする（ワークスペースではない）', async () => {
    const { runSignIn } = setup(TICKETS_DIR);
    await runSignIn();

    const calls = gitCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.cwd).toBe(TICKETS_DIR);
    }
    expect(calls.map((c) => c.cwd)).not.toContain(WORKSPACE_ROOT);
  });

  it('remote と現在ブランチをチケットリポジトリから引く', async () => {
    const { runSignIn } = setup(TICKETS_DIR);
    await runSignIn();

    const args = gitCalls().map((c) => c.args.join(' '));
    expect(args).toContain('remote get-url origin');
    expect(args).toContain('rev-parse --abbrev-ref HEAD');
  });

  it('tickets.directory が .tickets 自体でも親をリポジトリルートとして使う', async () => {
    const { runSignIn } = setup(`${TICKETS_DIR}/.tickets`);
    await runSignIn();

    for (const call of gitCalls()) {
      expect(call.cwd).toBe(TICKETS_DIR);
    }
  });

  it('解決できなければ git を実行しない', async () => {
    const { runSignIn } = setup('');
    await runSignIn();

    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe('サインイン導線と resolveContext の呼び出し回数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** open コマンドを実行し、webview の 'ready' 到達までを再現する。 */
  async function openPanel(configured: string): Promise<{
    fireReady: () => Promise<void>;
    warnCalls: () => unknown[][];
  }> {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    let onMessage: ((m: unknown) => unknown) | undefined;

    (vscode.commands.registerCommand as jest.Mock).mockImplementation(
      (id: string, h: (...a: unknown[]) => unknown) => {
        handlers.set(id, h);
        return { dispose: jest.fn() };
      },
    );
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => ({
      get: (key: string) =>
        section === 'anytimeAgent.tickets' && key === 'directory' ? configured : '',
      update: jest.fn(),
    }));
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: { fsPath: WORKSPACE_ROOT } }],
      configurable: true,
    });
    // 未サインイン（トークンが取れない）状態を作る
    (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => ({
      webview: {
        html: '',
        cspSource: 'vscode-webview:',
        asWebviewUri: (u: unknown) => u,
        onDidReceiveMessage: (l: (m: unknown) => unknown) => {
          onMessage = l;
          return { dispose: jest.fn() };
        },
        postMessage: jest.fn(),
      },
      onDidDispose: jest.fn(),
      reveal: jest.fn(),
      dispose: jest.fn(),
    }));
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (e: unknown, v: unknown) => void;
      const gitArgs = args[1] as string[];
      cb(null, {
        stdout: gitArgs.includes('remote')
          ? 'git@github.com:anytime-trial/anytime-ticket.git\n'
          : 'main\n',
        stderr: '',
      });
    });

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    registerTicketsFeature(
      { subscriptions: [], extensionUri: { fsPath: '/ext' } } as never,
      logger,
    );
    await handlers.get('anytime-agent.tickets.open')!();

    return {
      fireReady: async () => {
        await onMessage?.({ type: 'ready' });
        await new Promise((r) => setImmediate(r));
      },
      warnCalls: () => (logger.warn as jest.Mock).mock.calls,
    };
  }

  it('open だけでは resolveContext を呼ばない（ready 到達時に 1 度だけ解決する）', async () => {
    const panel = await openPanel(TICKETS_DIR);

    // open 時点で git を叩いていたら、ready 後の解決と合わせて二重になる
    expect(execFileMock).not.toHaveBeenCalled();

    await panel.fireReady();
    const remoteCalls = gitCalls().filter((c) => c.args.includes('remote'));
    expect(remoteCalls).toHaveLength(1);
  });

  it('未サインインなら init 送信時にサインインを促す', async () => {
    const panel = await openPanel(TICKETS_DIR);
    await panel.fireReady();

    expect(vscode.window.showWarningMessage as jest.Mock).toHaveBeenCalledTimes(1);
    const message = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('サインイン');
  });

  it('促すのは 1 度だけ（init が複数回来ても通知を積まない）', async () => {
    const panel = await openPanel(TICKETS_DIR);
    await panel.fireReady();
    await panel.fireReady();

    expect(vscode.window.showWarningMessage as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('リポジトリが解決できないときは促さない（空状態の案内で足りる）', async () => {
    const panel = await openPanel('');
    await panel.fireReady();

    expect(vscode.window.showWarningMessage as jest.Mock).not.toHaveBeenCalled();
  });
});
