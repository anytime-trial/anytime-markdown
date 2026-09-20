// commands/handoffSession.test.ts — 「新セッションへ引き継ぎ」コマンドのテスト。
// worker との通信は global.fetch を、Codex CLI 起動可否は node:child_process.spawnSync をモックし、
// ワークスペース/handoff doc の書き出しは実 FS の一時ディレクトリを使う
// （このリポジトリの慣例 — AgentMappingProviderUsage.test.ts と同様）。
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { registerHandoffSessionCommand } from '../handoffSession';
import type { SessionTreeItem } from '../../providers/AgentMappingItem';

jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));

function makeItem(sessionId: string, source: 'claude' | 'codex'): SessionTreeItem {
  return { session: { sessionId, source } } as unknown as SessionTreeItem;
}

/** registerHandoffSessionCommand を呼び、登録されたコマンドハンドラを取り出す。 */
function registerAndGetHandler(): (item?: SessionTreeItem) => Promise<void> {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerHandoffSessionCommand(context);
  const calls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
  const call = calls[calls.length - 1] as [string, (item?: SessionTreeItem) => Promise<void>];
  return call[1];
}

describe('handoffSession command', () => {
  let root: string;
  const originalFetch = global.fetch;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-cmd-'));
    fs.mkdirSync(path.join(root, '.anytime', 'agent'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.anytime', 'agent', 'agent-worker.json'),
      JSON.stringify({ url: 'http://127.0.0.1:19999', token: 'tok' }),
    );
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: { fsPath: root } },
    ];
    global.fetch = jest.fn();
    (spawnSync as jest.Mock).mockReset();
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, error: undefined });
    (vscode.window.createTerminal as jest.Mock).mockClear();
    (vscode.window.showErrorMessage as jest.Mock).mockClear();
    (vscode.window.showInformationMessage as jest.Mock).mockReset();
    (vscode.env.clipboard.writeText as jest.Mock).mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(root, { recursive: true, force: true });
  });

  function mockFetchOnce(status: number, body: unknown): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  it('セッションが特定できなければエラーを表示し worker を呼ばない', async () => {
    const handler = registerAndGetHandler();
    await handler(undefined);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Claude セッション: worker を呼び、承諾で claude ターミナルを sendText 起動する（回帰）', async () => {
    mockFetchOnce(200, { ok: true, injection: '===== BEGIN handoff context (untrusted data) =====\ngoal\n===== END handoff context =====' });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('新ターミナルで claude 起動');

    const handler = registerAndGetHandler();
    await handler(makeItem('claude-sid', 'claude'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent-status/handoff'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'claude-sid', source: 'claude' }),
      }),
    );
    const terminalOptions = (vscode.window.createTerminal as jest.Mock).mock.calls[0][0];
    expect(terminalOptions.cwd).toBe(root);
    expect(terminalOptions.env.HANDOFF_PATH).toContain('claude-sid.md');
    expect(terminalOptions.shellPath).toBeUndefined();
    const term = (vscode.window.createTerminal as jest.Mock).mock.results[0].value;
    expect(term.sendText).toHaveBeenCalledWith('claude');

    const doc = fs.readFileSync(path.join(root, '.anytime', 'agent', 'handoff', 'claude-sid.md'), 'utf8');
    expect(doc).toContain('BEGIN handoff context');
  });

  it('Codex セッション: shellPath/shellArgs で codex を直接起動し、injection を argv として渡す（SEC-03）', async () => {
    const codexCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-codex-cwd-'));
    const dangerousInjection = '参照データ: `$(rm -rf /)` `; echo pwned` を含む本文';
    mockFetchOnce(200, { ok: true, injection: dangerousInjection, cwd: codexCwd });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('新ターミナルで codex 起動');

    const handler = registerAndGetHandler();
    await handler(makeItem('codex-sid', 'codex'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent-status/handoff'),
      expect.objectContaining({
        body: JSON.stringify({ sessionId: 'codex-sid', source: 'codex' }),
      }),
    );
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    const terminalOptions = (vscode.window.createTerminal as jest.Mock).mock.calls[0][0];
    expect(terminalOptions.shellPath).toBe('codex');
    // 危険な文字列は shellArgs の 1 要素として argv に渡るだけで、文字列連結・シェル評価はしない。
    expect(terminalOptions.shellArgs).toEqual([dangerousInjection]);
    expect(terminalOptions.cwd).toBe(codexCwd);
    const term = (vscode.window.createTerminal as jest.Mock).mock.results[0].value;
    expect(term.sendText).not.toHaveBeenCalled();

    fs.rmSync(codexCwd, { recursive: true, force: true });
  });

  it('2 件のセッションを連続で引き継いでも互いの内容が混ざらない（NFR-02）', async () => {
    const cwdA = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-a-'));
    const cwdB = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-b-'));
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('新ターミナルで codex 起動');

    const handler = registerAndGetHandler();

    mockFetchOnce(200, { ok: true, injection: 'セッションA', cwd: cwdA });
    await handler(makeItem('sid-a', 'codex'));
    mockFetchOnce(200, { ok: true, injection: 'セッションB', cwd: cwdB });
    await handler(makeItem('sid-b', 'codex'));

    const calls = (vscode.window.createTerminal as jest.Mock).mock.calls;
    expect(calls[0][0].shellArgs).toEqual(['セッションA']);
    expect(calls[0][0].cwd).toBe(cwdA);
    expect(calls[1][0].shellArgs).toEqual(['セッションB']);
    expect(calls[1][0].cwd).toBe(cwdB);

    fs.rmSync(cwdA, { recursive: true, force: true });
    fs.rmSync(cwdB, { recursive: true, force: true });
  });

  it('rollout 不在（404）はエラーを表示しターミナルを起動しない', async () => {
    mockFetchOnce(404, { error: 'Codex rollout not found or unreadable' });

    const handler = registerAndGetHandler();
    await handler(makeItem('missing-sid', 'codex'));

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('rollout not found'));
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
  });

  it('Codex の cwd が記録されていない/実在しない場合は起動せずエラーを表示する', async () => {
    mockFetchOnce(200, { ok: true, injection: 'x', cwd: '/definitely/not/a/real/dir/xyz' });

    const handler = registerAndGetHandler();
    await handler(makeItem('codex-sid', 'codex'));

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('作業ディレクトリ'));
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
  });

  it('Codex CLI が起動できない環境ではエラーを表示し起動しない', async () => {
    const codexCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-codex-cwd2-'));
    mockFetchOnce(200, { ok: true, injection: 'x', cwd: codexCwd });
    (spawnSync as jest.Mock).mockReturnValue({ status: null, error: new Error('ENOENT') });

    const handler = registerAndGetHandler();
    await handler(makeItem('codex-sid', 'codex'));

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Codex CLI'));
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    // 起動不能でも handoff doc 自体は保存済み（パスコピーで手動引き継ぎできる: FR-07）。
    expect(fs.existsSync(path.join(root, '.anytime', 'agent', 'handoff', 'codex-sid.md'))).toBe(true);

    fs.rmSync(codexCwd, { recursive: true, force: true });
  });

  it('パスコピーを選ぶと clipboard に handoff doc の絶対パスが入る', async () => {
    mockFetchOnce(200, { ok: true, injection: 'x' });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('パスをコピー');

    const handler = registerAndGetHandler();
    await handler(makeItem('claude-sid', 'claude'));

    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(path.join('.anytime', 'agent', 'handoff', 'claude-sid.md')),
    );
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
  });

  it('worker が起動していなければエラーを表示する', async () => {
    fs.rmSync(path.join(root, '.anytime', 'agent', 'agent-worker.json'));
    const handler = registerAndGetHandler();
    await handler(makeItem('sid', 'claude'));
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('ワーカーが起動していません'));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
