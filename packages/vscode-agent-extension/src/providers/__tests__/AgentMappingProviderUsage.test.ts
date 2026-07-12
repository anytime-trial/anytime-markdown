import * as vscode from 'vscode';
import type { ClaudeStatusWatcher, ClaudeUsageResult } from '@anytime-markdown/vscode-common';
import { AgentMappingProvider } from '../AgentMappingProvider';
import { AgentLogger } from '../../utils/AgentLogger';

interface UsageClientStub {
  readonly fetchUsage: jest.Mock<Promise<ClaudeUsageResult>, []>;
}

const REFRESH_SECONDS = 120;
const REFRESH_MS = REFRESH_SECONDS * 1000;

function stubWatcher(): ClaudeStatusWatcher {
  const watcher = {
    onMultiStatusChange: jest.fn(),
    getAllAgents: () => new Map(),
    getTodayStats: () => ({ sessionCount: 0, totalTokens: 0 }),
  };
  return watcher as unknown as ClaudeStatusWatcher;
}

/** 既定値をそのまま返す設定スタブ（既定の vscode モックは get() が undefined を返し showUsage が false になる）。 */
function stubConfiguration(): void {
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (_key: string, defaultValue: unknown) => defaultValue,
  } as unknown as vscode.WorkspaceConfiguration);
}

/** onDidChangeConfiguration に登録されたコールバックを取り出す。 */
function registeredConfigListener(): (e: vscode.ConfigurationChangeEvent) => void {
  const calls = jest.mocked(vscode.workspace.onDidChangeConfiguration).mock.calls;
  const listener = calls.at(-1)?.[0];
  if (typeof listener !== 'function') {
    throw new Error('onDidChangeConfiguration listener was not registered');
  }
  return listener;
}

function usageClientReturning(result: ClaudeUsageResult): UsageClientStub {
  return { fetchUsage: jest.fn<Promise<ClaudeUsageResult>, []>().mockResolvedValue(result) };
}

function createProvider(usageClient: UsageClientStub): AgentMappingProvider {
  return new AgentMappingProvider(
    stubWatcher(),
    '/repo',
    undefined,
    undefined,
    usageClient as unknown as ConstructorParameters<typeof AgentMappingProvider>[4],
  );
}

describe('AgentMappingProvider usage warnings', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    stubConfiguration();
    warnSpy = jest.spyOn(AgentLogger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  // 取得は既定 120 秒周期。同じ未知 kind を毎周期 warn すると Output Channel が埋まる。
  it('warns once per unknown kind even across repeated refreshes', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: ['monthly'] });
    const provider = createProvider(usageClient);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);

    expect(usageClient.fetchUsage.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('monthly');

    provider.dispose();
  });

  // 設定変更でタイマーを張り直しても、既に知らせた kind を再び出さない。
  it('does not re-warn for a known-unknown kind after a configuration change restarts the timer', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: ['monthly'] });
    const provider = createProvider(usageClient);
    await jest.advanceTimersByTimeAsync(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    registeredConfigListener()({
      affectsConfiguration: (section: string) => section === 'anytimeAgent.usageRefreshSeconds',
    } as vscode.ConfigurationChangeEvent);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it('warns separately for each distinct unknown kind', async () => {
    const usageClient = usageClientReturning({
      kind: 'ok',
      rows: [],
      unknownKinds: ['monthly', 'daily'],
    });
    const provider = createProvider(usageClient);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls.map(call => call[0]).join(' ')).toContain('daily');

    provider.dispose();
  });

  it('does not warn when every limit kind is recognized', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: [] });
    const provider = createProvider(usageClient);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);

    expect(warnSpy).not.toHaveBeenCalled();

    provider.dispose();
  });
});
