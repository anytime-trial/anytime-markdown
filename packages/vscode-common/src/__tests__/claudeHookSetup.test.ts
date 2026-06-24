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

  test('registers hooks without creating any status file/dir', () => {
    const { setupClaudeHooks } = loadModule();

    const registered = setupClaudeHooks(tmpWorkspace);

    expect(registered).toBe(true);
    // 新方式ではフックはファイルを書かず agent-status ワーカーへ POST するため、
    // ディレクトリ作成は行わない。
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
  });

  test('Edit|Write hook posts to agent-status worker resolved from workspaceRoot', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const editPre = settings.hooks.PreToolUse.find(
      (e: { matcher?: string }) => e.matcher === 'Edit|Write',
    );
    const cmd: string = editPre.hooks[0].command;

    // agent-worker.json は workspaceRoot 基点で解決される
    expect(cmd).toContain(`${tmpWorkspace}/.anytime/agent/agent-worker.json`);
    // /edit エンドポイントへ POST する
    expect(cmd).toContain('/api/agent-status/edit');
    // worker の token を読み Bearer 認証ヘッダを付与する
    expect(cmd).toContain('w.token');
    expect(cmd).toContain("'Authorization':'Bearer '+tok");
    // git branch は workspaceRoot を cwd にして取得する
    expect(cmd).toContain(`cwd:'${tmpWorkspace}/'`);
    // 旧方式のファイル書き込み痕跡が無いこと
    expect(cmd).not.toContain('claude-code-status');
  });

  test('plan-file hook embeds workspaceRoot for plannedEdits path prefixing', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

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

  test('commit-tracker and session-guard both anchor AGENT_HOME at workspaceRoot', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );

    const commitTracker = settings.hooks.PostToolUse.find(
      (e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.[0]?.command?.includes('commit-tracker.sh'),
    );
    expect(commitTracker).toBeDefined();
    expect(commitTracker.hooks[0].command).toContain(
      `AGENT_HOME='${tmpWorkspace}/.anytime/agent'`,
    );
    expect(commitTracker.hooks[0].command).not.toContain('${CWD}');
    // 旧 trail サーバ /api/message-commits への通知が消えていること
    expect(commitTracker.hooks[0].command).not.toContain('message-commits');

    const sessionGuard = settings.hooks.UserPromptSubmit.find(
      (e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.[0]?.command?.includes('session-guard.sh'),
    );
    expect(sessionGuard).toBeDefined();
    expect(sessionGuard.hooks[0].command).toContain(
      `AGENT_HOME='${tmpWorkspace}/.anytime/agent'`,
    );
    expect(sessionGuard.hooks[0].command).not.toContain('${CWD}');
  });

  test('commit-tracker.sh script targets agent-status worker, not trail message-commits', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const script = fs.readFileSync(
      path.join(tmpHome, '.claude', 'scripts', 'commit-tracker.sh'),
      'utf-8',
    );
    expect(script).toContain('/api/agent-status/commit');
    expect(script).toContain('agent-worker.json');
    expect(script).not.toContain('/api/message-commits');
    // git-state ファイルへの書き込みが廃止されていること
    expect(script).not.toContain('git-state');
  });

  test('session-guard.sh writes its state file under AGENT_HOME (.anytime/agent)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const script = fs.readFileSync(
      path.join(tmpHome, '.claude', 'scripts', 'session-guard.sh'),
      'utf-8',
    );
    // state ファイルは .anytime/agent 配下（AGENT_HOME）に書く
    expect(script).toContain('AGENT_HOME');
    expect(script).toContain('.anytime/agent');
    expect(script).toContain('${AGENT_HOME}/claude-session-guard.json');
    // 旧 .anytime/trail/state 配下への書き込みが廃止されていること
    expect(script).not.toContain('TRAIL_HOME');
    expect(script).not.toContain('.anytime/trail/state');
  });

  test('handoff-inject hook registered, script written, and .anytime/ gitignored', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    );
    const inject = settings.hooks.UserPromptSubmit.find(
      (e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.[0]?.command?.includes('handoff-inject.sh'),
    );
    expect(inject).toBeDefined();
    expect(inject.hooks[0].command).toContain(`AGENT_HOME='${tmpWorkspace}/.anytime/agent'`);

    const script = fs.readFileSync(
      path.join(tmpHome, '.claude', 'scripts', 'handoff-inject.sh'),
      'utf-8',
    );
    // additionalContext として JSON 出力し、source==現セッションは除外、rename で消費
    expect(script).toContain('additionalContext');
    expect(script).toContain('UserPromptSubmit');
    expect(script).toContain('.consumed');

    const gi = fs.readFileSync(path.join(tmpWorkspace, '.gitignore'), 'utf-8');
    expect(gi).toContain('.anytime/');
  });

  test('ensureAnytimeGitignored は冪等（既存 .anytime/ を重複追加しない）', () => {
    const { setupClaudeHooks } = loadModule();
    fs.writeFileSync(path.join(tmpWorkspace, '.gitignore'), 'node_modules/\n.anytime/\n');
    setupClaudeHooks(tmpWorkspace);
    const gi = fs.readFileSync(path.join(tmpWorkspace, '.gitignore'), 'utf-8');
    expect(gi.split('.anytime/').length - 1).toBe(1);
  });

  test('is idempotent: running twice does not duplicate hook entries', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);
    setupClaudeHooks(tmpWorkspace);

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
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(false);
  });

  test('returns false when settings.json contains invalid JSON', () => {
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      'not valid json {',
      'utf-8',
    );
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(false);
  });

  test('settings.json が存在しない（ENOENT）場合は空の設定で続行する', () => {
    // ENOENT は「設定ファイル未作成」として許容 → hooks を初期化して true を返す
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(true);
    const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
  });

  test('workspaceRoot に末尾スラッシュが複数あっても正規化される', () => {
    const { setupClaudeHooks } = loadModule();
    const rootWithSlashes = tmpWorkspace.replace(/\/*$/, '//');
    const result = setupClaudeHooks(rootWithSlashes);
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
});
