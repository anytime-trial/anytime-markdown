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
