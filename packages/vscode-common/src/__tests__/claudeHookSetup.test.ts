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
});
