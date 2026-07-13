import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ClaudeUsageCoordinator } from '@anytime-markdown/vscode-common';
import type { AgentInfo, ClaudeStatusWatcher, ClaudeUsageClient, ClaudeUsageResult, CodexSessionScanner } from '@anytime-markdown/vscode-common';
import { AgentMappingProvider } from '../AgentMappingProvider';
import { SourceGroupItem, TodaySummaryItem, UsageGroupItem, UsageLimitItem, WorkspaceGroupItem } from '../AgentMappingItem';
import { AgentLogger } from '../../utils/AgentLogger';

interface UsageClientStub {
  readonly fetchUsage: jest.Mock<Promise<ClaudeUsageResult>, []>;
}

const REFRESH_SECONDS = 600;
const REFRESH_MS = REFRESH_SECONDS * 1000;
const tempDirs: string[] = [];
const USAGE_ROW = {
  key: 'session',
  label: 'Session (5h)',
  percent: 29,
  severity: 'normal',
  resetsAt: '2026-07-12T14:19:59.000Z',
} as const;

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

function usageClientReturningSequence(...results: ClaudeUsageResult[]): UsageClientStub {
  const fetchUsage = jest.fn<Promise<ClaudeUsageResult>, []>();
  for (const result of results) {
    fetchUsage.mockResolvedValueOnce(result);
  }
  return { fetchUsage };
}

/** 取得ポリシー（TTL・バックオフ・共有キャッシュ）ごと実物の Coordinator を通す。キャッシュは一時ディレクトリへ隔離する。 */
function createProvider(usageClient: UsageClientStub, cacheDir = makeCacheDir()): AgentMappingProvider {
  const coordinator = new ClaudeUsageCoordinator({
    cachePath: path.join(cacheDir, 'claude-usage-cache.json'),
    client: usageClient as unknown as ClaudeUsageClient,
  });
  return new AgentMappingProvider(stubWatcher(), '/repo', undefined, undefined, coordinator);
}

function makeCacheDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-provider-'));
  tempDirs.push(dir);
  return dir;
}

function writeCachedUsage(cacheDir: string, fetchedAt: string): void {
  fs.writeFileSync(path.join(cacheDir, 'claude-usage-cache.json'), JSON.stringify({
    version: 1,
    rows: [USAGE_ROW],
    fetchedAt,
    backoffUntil: null,
    failureCount: 0,
  }), 'utf-8');
}

function findClaudeUsageGroup(provider: AgentMappingProvider): UsageGroupItem | undefined {
  const root = provider.getChildren();
  const claudeGroup = root.find((item): item is SourceGroupItem =>
    item instanceof SourceGroupItem && item.source === 'claude');
  return claudeGroup?.children.find((item): item is UsageGroupItem => item instanceof UsageGroupItem);
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
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // 取得は既定 120 秒周期。同じ未知 kind を毎周期 warn すると Output Channel が埋まる。
  it('warns once per unknown kind even across repeated refreshes', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: ['monthly'] });
    const provider = createProvider(usageClient);

    await provider.whenUsageSettled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();

    expect(usageClient.fetchUsage.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('monthly');

    provider.dispose();
  });

  // 設定変更でタイマーを張り直しても、既に知らせた kind を再び出さない。
  it('does not re-warn for a known-unknown kind after a configuration change restarts the timer', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: ['monthly'] });
    const provider = createProvider(usageClient);
    await provider.whenUsageSettled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    registeredConfigListener()({
      affectsConfiguration: (section: string) => section === 'anytimeAgent.usageRefreshSeconds',
    } as vscode.ConfigurationChangeEvent);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();

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

    await provider.whenUsageSettled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls.map(call => call[0]).join(' ')).toContain('daily');

    provider.dispose();
  });

  it('does not warn when every limit kind is recognized', async () => {
    const usageClient = usageClientReturning({ kind: 'ok', rows: [], unknownKinds: [] });
    const provider = createProvider(usageClient);

    await provider.whenUsageSettled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();

    expect(warnSpy).not.toHaveBeenCalled();

    provider.dispose();
  });

  it('keeps the Usage node visible with a placeholder when the first refresh is rate limited', async () => {
    const usageClient = usageClientReturning({ kind: 'rateLimited' });
    const provider = createProvider(usageClient);

    await provider.whenUsageSettled();

    const usage = findClaudeUsageGroup(provider);
    expect(usage).toBeInstanceOf(UsageGroupItem);
    expect(usage?.description).toContain('レート制限');
    expect(usage?.children[0]).toBeInstanceOf(UsageLimitItem);
    expect(usage?.children[0]?.label).toBe('レート制限中');

    provider.dispose();
  });

  it('shows stale rows when a later refresh is rate limited after a successful value', async () => {
    const usageClient = usageClientReturningSequence(
      { kind: 'ok', rows: [USAGE_ROW], unknownKinds: [] },
      { kind: 'rateLimited' },
    );
    const provider = createProvider(usageClient);

    await provider.whenUsageSettled();
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    await provider.whenUsageSettled();

    const usage = findClaudeUsageGroup(provider);
    expect(usage).toBeInstanceOf(UsageGroupItem);
    expect(usage?.description).toContain('Session 29%');
    expect(usage?.description).toContain('stale');
    expect(usage?.description).toContain('レート制限');

    provider.dispose();
  });

  // 別ウィンドウが書いた共有キャッシュを、429 続きの新規ウィンドウでも stale として出す（本件の再発防止）。
  it('shows cached stale rows when a shared cache exists and refresh is rate limited', async () => {
    const usageClient = usageClientReturning({ kind: 'rateLimited' });
    const cacheDir = makeCacheDir();
    writeCachedUsage(cacheDir, '2026-07-12T13:00:00.000Z');
    jest.setSystemTime(Date.parse('2026-07-12T13:20:00.000Z'));
    const provider = createProvider(usageClient, cacheDir);

    await provider.whenUsageSettled();

    const usage = findClaudeUsageGroup(provider);
    expect(usage).toBeInstanceOf(UsageGroupItem);
    expect(usage?.description).toContain('Session 29%');
    expect(usage?.description).toContain('stale');
    expect(usage?.description).toContain('レート制限');

    provider.dispose();
  });

  // 設定変更の張り直しとタイマーが重なっても、同じウィンドウから同時に 2 本叩かない（自らレート制限を悪化させない）。
  it('does not run overlapping usage fetches', async () => {
    let release: (() => void) | undefined;
    const usageClient: UsageClientStub = {
      fetchUsage: jest.fn<Promise<ClaudeUsageResult>, []>().mockImplementation(
        () => new Promise(resolve => {
          release = () => resolve({ kind: 'ok', rows: [USAGE_ROW], unknownKinds: [] });
        }),
      ),
    };
    const provider = createProvider(usageClient);

    // 初回取得が未解決のまま設定変更で張り直す。
    registeredConfigListener()({
      affectsConfiguration: (section: string) => section === 'anytimeAgent.usageRefreshSeconds',
    } as vscode.ConfigurationChangeEvent);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);

    expect(usageClient.fetchUsage).toHaveBeenCalledTimes(1);

    release?.();
    await provider.whenUsageSettled();
    provider.dispose();
  });

  it('hides the Usage node only when Claude usage is unauthenticated', async () => {
    const usageClient = usageClientReturning({ kind: 'unauthenticated' });
    const provider = createProvider(usageClient);

    await provider.whenUsageSettled();

    expect(findClaudeUsageGroup(provider)).toBeUndefined();

    provider.dispose();
  });

  it('adds Codex Usage then Today before workspace groups', () => {
    const repoRoot = cp.execSync('git rev-parse --show-toplevel', {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    const codexAgent: AgentInfo = {
      sessionId: 'codex-session-1',
      source: 'codex',
      editing: false,
      file: '',
      timestamp: '2026-07-12T13:16:08.224Z',
      branch: '',
      sessionEdits: [],
      plannedEdits: [],
      workspacePath: repoRoot,
      contextTokens: 100,
    };
    const codexScanner = {
      scan: jest.fn<readonly AgentInfo[], [readonly string[]]>().mockReturnValue([codexAgent]),
      getUsageSnapshot: jest.fn().mockReturnValue({
        observedAt: '2026-07-12T13:16:08.224Z',
        rows: [
          {
            key: 'session',
            label: 'Session (5h)',
            percent: 11,
            severity: 'normal',
            resetsAt: '2026-07-12T18:08:57.000Z',
          },
          {
            key: 'weekly_all',
            label: 'Weekly (7d)',
            percent: 8,
            severity: 'normal',
            resetsAt: '2026-07-18T22:47:10.000Z',
          },
        ],
      }),
      getTodayStats: jest.fn().mockReturnValue({ sessionCount: 1, totalTokens: 1818337 }),
    } as unknown as CodexSessionScanner;
    const provider = new AgentMappingProvider(
      stubWatcher(),
      repoRoot,
      codexScanner,
      undefined,
      usageClientReturning({ kind: 'ok', rows: [], unknownKinds: [] }) as unknown as ConstructorParameters<typeof AgentMappingProvider>[4],
    );

    const root = provider.getChildren();
    const codexGroup = root.find((item): item is SourceGroupItem =>
      item instanceof SourceGroupItem && item.source === 'codex');
    expect(codexGroup).toBeDefined();
    const children = codexGroup?.children ?? [];

    expect(children[0]).toBeInstanceOf(UsageGroupItem);
    expect(children[1]).toBeInstanceOf(TodaySummaryItem);
    expect(children[2]).toBeInstanceOf(WorkspaceGroupItem);
    expect(codexGroup?.description).toBe('1');

    provider.dispose();
  });
});
