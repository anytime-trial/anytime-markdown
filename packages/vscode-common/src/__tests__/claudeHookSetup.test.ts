import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// jest-environment-node のサンドボックス内では process.env.HOME を書き換えても
// ネイティブ側の home 解決に伝播しない。本番ホームに書き込まないよう、明示的に env を
// 参照するモックで homedir を差し替える。HOME 未設定時は即座に失敗させ、本番への
// フォールバックを禁止する。
jest.mock('node:os', () => {
  const actual: typeof import('node:os') = jest.requireActual('node:os');
  return {
    ...actual,
    homedir: () => {
      const h = process.env.HOME;
      if (!h) {
        throw new Error('HOME not set in test environment - refusing fallback to real home');
      }
      return h;
    },
  };
});

describe('setupClaudeHooks', () => {
  let tmpHome: string;
  let tmpWorkspace: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-home-'));
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-ws-'));
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    process.env.HOME = tmpHome;
    jest.resetModules();

    // 安全装置: HOME が一時ディレクトリでなければ即座に失敗させ、本番への書き込みを禁止する
    if (!process.env.HOME.startsWith(os.tmpdir())) {
      throw new Error(
        `Test isolation broken: HOME (${process.env.HOME}) is not under ${os.tmpdir()}`,
      );
    }
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  function loadModule(): typeof import('../claude/claudeHookSetup') {
    return require('../claude/claudeHookSetup');
  }

  test('creates the status directory for a multi-segment relative statusDir', () => {
    const { setupClaudeHooks } = loadModule();
    const statusDir = '.anytime/trail/agent-status';

    const registered = setupClaudeHooks(tmpWorkspace, statusDir);

    expect(registered).toBe(true);
    const expectedDir = path.join(tmpWorkspace, statusDir);
    expect(fs.existsSync(expectedDir)).toBe(true);
    expect(fs.statSync(expectedDir).isDirectory()).toBe(true);
  });

  test('Edit|Write hook command uses workspaceRoot as cwd (not derived from statusFile)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace, '.anytime/trail/agent-status');

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const editPre = settings.hooks.PreToolUse.find(
      (e: { matcher?: string }) => e.matcher === 'Edit|Write',
    );
    const cmd: string = editPre.hooks[0].command;

    expect(cmd).toContain(`cwd:'${tmpWorkspace}/'`);
    const wrongCwd = path.join(tmpWorkspace, '.anytime', 'trail') + '/';
    expect(cmd).not.toContain(`cwd:'${wrongCwd}'`);
  });

  test('plan-file hook embeds workspaceRoot for plannedEdits path prefixing', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace, '.anytime/trail/agent-status');

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const writePost = settings.hooks.PostToolUse.filter(
      (e: { matcher?: string }) => e.matcher === 'Write',
    );
    const planEntry = writePost.find((e: { hooks: Array<{ command: string }> }) =>
      e.hooks[0].command.includes('plannedEdits'),
    );

    expect(planEntry).toBeDefined();
    const planCmd: string = planEntry.hooks[0].command;
    expect(planCmd).toContain(`wr='${tmpWorkspace}/'`);
    const wrongWr = path.join(tmpWorkspace, '.anytime', 'trail') + '/';
    expect(planCmd).not.toContain(`wr='${wrongWr}'`);
  });

  test('commit-tracker / session-guard hooks anchor TRAIL_HOME at workspaceRoot (not cwd-relative)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace, '.anytime/trail/agent-status');

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const expectedEnv = `TRAIL_HOME='${tmpWorkspace}/.anytime/trail'`;

    const commitTracker = settings.hooks.PostToolUse.find(
      (e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.[0]?.command?.includes('commit-tracker.sh'),
    );
    expect(commitTracker).toBeDefined();
    expect(commitTracker.hooks[0].command).toContain(expectedEnv);

    const sessionGuard = settings.hooks.UserPromptSubmit.find(
      (e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.[0]?.command?.includes('session-guard.sh'),
    );
    expect(sessionGuard).toBeDefined();
    expect(sessionGuard.hooks[0].command).toContain(expectedEnv);

    // cwd 相対のフォールバックが残っていないこと（${CWD} を含まない）
    expect(commitTracker.hooks[0].command).not.toContain('${CWD}');
    expect(sessionGuard.hooks[0].command).not.toContain('${CWD}');
  });

  test('is idempotent: running twice does not duplicate hook entries', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace, '.anytime/trail/agent-status');
    setupClaudeHooks(tmpWorkspace, '.anytime/trail/agent-status');

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const editPreCount = settings.hooks.PreToolUse.filter(
      (e: { matcher?: string }) => e.matcher === 'Edit|Write',
    ).length;
    expect(editPreCount).toBe(1);
  });

  test('returns false when the .claude directory does not exist', () => {
    fs.rmSync(path.join(tmpHome, '.claude'), { recursive: true, force: true });
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace, '.anytime');
    expect(result).toBe(false);
  });

  test('returns false when settings.json contains invalid JSON', () => {
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      'not valid json {',
      'utf-8',
    );
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace, '.anytime');
    expect(result).toBe(false);
  });

  test('getStatusFilePath returns absolute statusDir as-is', () => {
    const { getStatusFilePath } = loadModule();
    const abs = path.join(tmpWorkspace, 'custom-abs');
    const result = getStatusFilePath(tmpWorkspace, abs);
    expect(result).toBe(path.join(abs, 'claude-code-status.json'));
  });

  test('getStatusFilePath falls back to homedir when workspaceRoot is undefined', () => {
    const { getStatusFilePath } = loadModule();
    const result = getStatusFilePath(undefined, '.anytime');
    expect(result.startsWith(tmpHome)).toBe(true);
    expect(result.endsWith('claude-code-status.json')).toBe(true);
  });

  test('getStatusFileGlob includes wildcard for session-aware files', () => {
    const { getStatusFileGlob } = loadModule();
    expect(getStatusFileGlob(tmpWorkspace, '.anytime')).toBe(
      path.join(tmpWorkspace, '.anytime', 'claude-code-status*.json'),
    );
    expect(getStatusFileGlob(undefined, '.anytime')).toBe(
      path.join(tmpHome, '.anytime', 'claude-code-status*.json'),
    );
    // absolute statusDir path
    const abs = path.join(tmpWorkspace, 'abs-status');
    expect(getStatusFileGlob(tmpWorkspace, abs)).toBe(
      path.join(abs, 'claude-code-status*.json'),
    );
    expect(getStatusFileGlob(undefined, abs)).toBe(
      path.join(abs, 'claude-code-status*.json'),
    );
  });

  test('settings.json が存在しない（ENOENT）場合は空の設定で続行する', () => {
    // ENOENT は「設定ファイル未作成」として許容 → hooks を初期化して true を返す
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace, '.anytime');
    expect(result).toBe(true);
    const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
  });

  test('workspaceRoot に末尾スラッシュが複数あっても正規化される', () => {
    const { setupClaudeHooks } = loadModule();
    const rootWithSlashes = tmpWorkspace.replace(/\/*$/, '//');
    const result = setupClaudeHooks(rootWithSlashes, '.anytime');
    expect(result).toBe(true);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const editPre = settings.hooks.PreToolUse.find(
      (e: { matcher?: string }) => e.matcher === 'Edit|Write',
    );
    const cmd: string = editPre.hooks[0].command;
    // 末尾スラッシュが1つに正規化されている
    expect(cmd).toContain(`cwd:'${tmpWorkspace}/'`);
    expect(cmd).not.toContain(`//`);
  });

  test('statusDir が絶対パスのとき getStatusFileGlob はそのまま使う', () => {
    const { getStatusFileGlob } = loadModule();
    const absDir = path.join(tmpWorkspace, 'abs-dir');
    const result = getStatusFileGlob(undefined, absDir);
    expect(result).toBe(path.join(absDir, 'claude-code-status*.json'));
  });
});
