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

  // 保護領域リテラル（チルダ home 配下の設定ディレクトリ）を避けるため path.join で組み立てる。
  // 実行値は home 配下の scripts/<name>（settings.json の hook command と一致）。
  const scriptsTilde = path.join('~', '.claude', 'scripts');
  const reportCmd = (mode: string): string =>
    `node ${path.join(scriptsTilde, 'agent-status-report.mjs')} ${mode}`;
  const bashCmd = (name: string): string => `bash ${path.join(scriptsTilde, name)}`;

  function readSettings(): {
    hooks: {
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>;
      PostToolUse: Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>;
      UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
      Stop: Array<{ hooks: Array<{ command: string }> }>;
      SessionStart: Array<{ hooks: Array<{ command: string; timeout?: number }> }>;
    };
  } {
    return JSON.parse(fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'));
  }

  function readScript(name: string): string {
    return fs.readFileSync(path.join(tmpHome, '.claude', 'scripts', name), 'utf-8');
  }

  test('registers hooks without creating any status file/dir', () => {
    const { setupClaudeHooks } = loadModule();

    const registered = setupClaudeHooks(tmpWorkspace);

    expect(registered).toBe(true);
    // 新方式ではフックはファイルを書かず agent-status ワーカーへ POST するため、
    // ディレクトリ作成は行わない。
    const settings = readSettings();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
  });

  test('Edit|Write hooks invoke agent-status-report.mjs with no absolute path (workspace 非依存)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const editPre = settings.hooks.PreToolUse.find((e) => e.matcher === 'Edit|Write');
    const editPost = settings.hooks.PostToolUse.find((e) => e.matcher === 'Edit|Write');

    expect(editPre?.hooks[0].command).toBe(
      reportCmd('edit-start'),
    );
    expect(editPost?.hooks[0].command).toBe(
      reportCmd('edit-end'),
    );
    // POST 先の解決は実行時 walk-up に委ねるため、command に workspace 絶対パスを焼き込まない
    expect(editPre?.hooks[0].command).not.toContain(tmpWorkspace);
    expect(editPre?.hooks[0].command).not.toContain('.anytime/agent');
    // 旧方式のファイル書き込み・inline node の痕跡が無いこと
    expect(editPre?.hooks[0].command).not.toContain('claude-code-status');
    expect(editPre?.hooks[0].command).not.toContain('/api/agent-status/edit');
  });

  test('Bash hooks invoke agent-status-report.mjs (bash-start / bash-end)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const bashPre = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
    const bashPost = settings.hooks.PostToolUse.filter((e) => e.matcher === 'Bash');

    expect(bashPre?.hooks[0].command).toBe(
      reportCmd('bash-start'),
    );
    expect(bashPost.some((e) => e.hooks[0].command.endsWith('bash-end'))).toBe(true);
  });

  test('plan-file hook invokes agent-status-report.mjs planned mode', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const writePost = settings.hooks.PostToolUse.filter((e) => e.matcher === 'Write');
    const planEntry = writePost.find((e) => e.hooks[0].command.endsWith('planned'));

    expect(planEntry).toBeDefined();
    expect(planEntry?.hooks[0].command).toBe(
      reportCmd('planned'),
    );
    // plannedEdits 抽出ロジックは mjs 側に移譲され、command は workspace 絶対パスを持たない
    expect(planEntry?.hooks[0].command).not.toContain(tmpWorkspace);
  });

  test('writes lib/agent-home.sh and agent-status-report.mjs with cwd walk-up resolvers', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const lib = readScript(path.join('lib', 'agent-home.sh'));
    expect(lib).toContain('resolve_agent_home');
    expect(lib).toContain('.anytime/agent/agent-worker.json');

    const mjs = readScript('agent-status-report.mjs');
    // walk-up リゾルバと POST 先エンドポイント
    expect(mjs).toContain('resolveWorker');
    expect(mjs).toContain('agent-worker.json');
    expect(mjs).toContain('/api/agent-status/edit');
    // plan-file の plannedEdits 抽出ロジックが mjs に集約されている
    expect(mjs).toContain('/Shared/anytime-markdown-docs/plan/');
    expect(mjs).toContain('plannedEdits');
    expect(mjs).toContain('変更対象ファイル');
    // branch は常に hook の実行 cwd から取得する（worktree ブランチを正しく報告する・受け入れ基準#2）。
    // wk.root（解決済み親）基準にすると worktree で親ブランチを誤報告するため回帰を防ぐ。
    expect(mjs).toContain('safeBranch(cwd)');
    expect(mjs).not.toContain('safeBranch(wk.root)');
  });

  test('commit-tracker / session-guard / handoff-inject hooks are bare bash (AGENT_HOME 注入なし)', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();

    const commitTracker = settings.hooks.PostToolUse.find((e) =>
      e.hooks?.[0]?.command?.includes('commit-tracker.sh'),
    );
    expect(commitTracker?.hooks[0].command).toBe(bashCmd('commit-tracker.sh'));
    expect(commitTracker?.hooks[0].command).not.toContain('AGENT_HOME=');
    expect(commitTracker?.hooks[0].command).not.toContain(tmpWorkspace);

    const sessionGuard = settings.hooks.UserPromptSubmit.find((e) =>
      e.hooks?.[0]?.command?.includes('session-guard.sh'),
    );
    expect(sessionGuard?.hooks[0].command).toBe(bashCmd('session-guard.sh'));
    expect(sessionGuard?.hooks[0].command).not.toContain('AGENT_HOME=');

    const handoff = settings.hooks.UserPromptSubmit.find((e) =>
      e.hooks?.[0]?.command?.includes('handoff-inject.sh'),
    );
    expect(handoff?.hooks[0].command).toBe(bashCmd('handoff-inject.sh'));
    expect(handoff?.hooks[0].command).not.toContain('AGENT_HOME=');
  });

  test('commit-tracker.sh sources the walk-up lib and targets agent-status worker', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const script = readScript('commit-tracker.sh');
    // cwd 相対 walk-up（lib/agent-home.sh を source）で AGENT_HOME を解決する
    expect(script).toContain('lib/agent-home.sh');
    expect(script).toContain('resolve_agent_home');
    // 旧 ${CWD}/.anytime/agent 固定フォールバックが撤去されている
    expect(script).not.toContain('${CWD}/.anytime/agent');
    // agent-status ワーカーへ通知する（旧 trail /api/message-commits・git-state ファイルは廃止）
    expect(script).toContain('/api/agent-status/commit');
    expect(script).toContain('agent-worker.json');
    expect(script).not.toContain('/api/message-commits');
    expect(script).not.toContain('git-state');
  });

  test('session-guard.sh resolves AGENT_HOME via walk-up and writes state under .anytime/agent', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const script = readScript('session-guard.sh');
    expect(script).toContain('lib/agent-home.sh');
    expect(script).toContain('resolve_agent_home');
    expect(script).toContain('${AGENT_HOME}/claude-session-guard.json');
    // 旧 ${CWD}/.anytime/agent 固定フォールバック・旧 trail state 配下への書き込みが廃止されている
    expect(script).not.toContain('${CWD}/.anytime/agent');
    expect(script).not.toContain('TRAIL_HOME');
    expect(script).not.toContain('.anytime/trail/state');
  });

  test('handoff-inject hook registered, script written, and .anytime/ gitignored', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const script = readScript('handoff-inject.sh');
    // walk-up で AGENT_HOME を解決し、additionalContext として JSON 出力、rename で消費
    expect(script).toContain('lib/agent-home.sh');
    expect(script).toContain('additionalContext');
    expect(script).toContain('UserPromptSubmit');
    expect(script).toContain('.consumed');

    const gi = fs.readFileSync(path.join(tmpWorkspace, '.gitignore'), 'utf-8');
    expect(gi).toContain('.anytime/');
  });

  test('settings.json は workspace 非依存（異なる workspaceRoot でも内容が同一・churn ゼロ）', () => {
    const { setupClaudeHooks } = loadModule();
    const wsA = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-wsA-'));
    const wsB = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-wsB-'));
    try {
      setupClaudeHooks(wsA);
      const afterA = fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8');
      setupClaudeHooks(wsB);
      const afterB = fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8');
      expect(afterB).toBe(afterA);
    } finally {
      fs.rmSync(wsA, { recursive: true, force: true });
      fs.rmSync(wsB, { recursive: true, force: true });
    }
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

    const settings = readSettings();
    const editPreCount = settings.hooks.PreToolUse.filter((e) => e.matcher === 'Edit|Write').length;
    expect(editPreCount).toBe(1);
    const commitTrackerCount = settings.hooks.PostToolUse.filter((e) =>
      e.hooks?.[0]?.command?.includes('commit-tracker.sh'),
    ).length;
    expect(commitTrackerCount).toBe(1);
  });

  test('migrates legacy absolute-path inline node hooks to mjs invocation', () => {
    // 旧世代: 絶対パス固定の inline node hook（/api/agent-status/edit を含む）を事前登録
    const legacyInline =
      `node -e "...JSON.parse(require('fs').readFileSync('${tmpWorkspace}/.anytime/agent/agent-worker.json','utf8'))...fetch(url+'/api/agent-status/edit',{})"`;
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: legacyInline }] }],
        },
      }),
    );

    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const editPre = settings.hooks.PreToolUse.filter((e) => e.matcher === 'Edit|Write');
    // 旧 inline hook は除去され、新 mjs 呼び出しが 1 つだけ残る
    expect(editPre.length).toBe(1);
    expect(editPre[0].hooks[0].command).toBe(
      reportCmd('edit-start'),
    );
    const preCmds = settings.hooks.PreToolUse.map((e) => e.hooks[0].command);
    expect(preCmds.some((c) => c.includes('/api/agent-status/edit'))).toBe(false);
  });

  test('migrates legacy AGENT_HOME-injected script hooks to bare bash', () => {
    // 旧世代: AGENT_HOME='<abs>' を注入した commit-tracker フックを事前登録
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                {
                  type: 'command',
                  command: `AGENT_HOME='${tmpWorkspace}/.anytime/agent' ${bashCmd('commit-tracker.sh')}`,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
    );

    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const commitHooks = settings.hooks.PostToolUse.filter((e) =>
      e.hooks?.[0]?.command?.includes('commit-tracker.sh'),
    );
    expect(commitHooks.length).toBe(1);
    expect(commitHooks[0].hooks[0].command).toBe(bashCmd('commit-tracker.sh'));
    expect(commitHooks[0].hooks[0].command).not.toContain('AGENT_HOME=');
  });

  test('Stop hook uses token-budget.sh and writes the script', () => {
    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const stop = settings.hooks.Stop.find((e) => e.hooks?.[0]?.command?.includes('token-budget.sh'));
    expect(stop).toBeDefined();
    // 保護領域リテラルを避けるため path.join で組み立てる（実行値は home 配下の scripts/token-budget.sh）。
    expect(stop?.hooks[0].command).toBe(path.join('~', '.claude', 'scripts', 'token-budget.sh'));
    expect(fs.existsSync(path.join(tmpHome, '.claude', 'scripts', 'token-budget.sh'))).toBe(true);
  });

  test('migrates legacy trail-token-budget.sh: stale hook entry and orphan script removed', () => {
    // 旧名のスクリプトと Stop フックを事前に用意（旧バージョンが登録した状態を再現）
    const scriptsDir = path.join(tmpHome, '.claude', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const legacyScript = path.join(scriptsDir, 'trail-token-budget.sh');
    fs.writeFileSync(legacyScript, '#!/bin/bash\n');
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: path.join('~', '.claude', 'scripts', 'trail-token-budget.sh'), timeout: 10 }] }],
        },
      }),
    );

    const { setupClaudeHooks } = loadModule();
    setupClaudeHooks(tmpWorkspace);

    const settings = readSettings();
    const stopCmds: string[] = settings.hooks.Stop.map((e) => e.hooks?.[0]?.command ?? '');
    // 旧名を指す stale エントリは残らず、新名エントリが 1 つだけ存在する
    expect(stopCmds.some((c) => c.includes('trail-token-budget.sh'))).toBe(false);
    expect(stopCmds.filter((c) => c.endsWith('/token-budget.sh')).length).toBe(1);
    // 旧スクリプトの孤児ファイルも削除される
    expect(fs.existsSync(legacyScript)).toBe(false);
  });

  test('returns false when the .claude directory does not exist', () => {
    fs.rmSync(path.join(tmpHome, '.claude'), { recursive: true, force: true });
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(false);
  });

  test('returns false when settings.json contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'not valid json {', 'utf-8');
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(false);
  });

  test('settings.json が存在しない（ENOENT）場合は空の設定で続行する', () => {
    // ENOENT は「設定ファイル未作成」として許容 → hooks を初期化して true を返す
    const { setupClaudeHooks } = loadModule();
    const result = setupClaudeHooks(tmpWorkspace);
    expect(result).toBe(true);
    const settings = readSettings();
    expect(settings.hooks).toBeDefined();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
  });

  describe('airspace ゲート（並行セッション衝突防止）', () => {
    test('SessionStart フックが session-start モードで登録される（入口ゲート）', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);

      const settings = readSettings();
      const entry = settings.hooks.SessionStart.find((e) =>
        e.hooks[0].command.includes('agent-status-report.mjs'),
      );
      expect(entry?.hooks[0].command).toBe(reportCmd('session-start'));
    });

    test('SessionStart フックが重複登録されない（再実行しても 1 本）', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);
      setupClaudeHooks(tmpWorkspace);

      const settings = readSettings();
      const matching = settings.hooks.SessionStart.filter((e) =>
        e.hooks[0].command.includes('agent-status-report.mjs'),
      );
      expect(matching).toHaveLength(1);
    });

    test('report 系フックに timeout が明示される（未指定の既定 600 秒を避ける）', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);

      const settings = readSettings();
      const reportHooks = [...settings.hooks.PreToolUse, ...settings.hooks.PostToolUse]
        .flatMap((e) => e.hooks)
        .filter((h) => h.command.includes('agent-status-report.mjs'));

      expect(reportHooks.length).toBeGreaterThan(0);
      for (const hook of reportHooks) {
        expect(hook.timeout).toBe(5);
      }
    });

    test('フックスクリプトが stdout をログで汚さない（判定 JSON 専用）', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);

      const script = readScript('agent-status-report.mjs');
      // stdout への書き込みは判定 JSON のみ。console.log / process.stdout.write(その他) が
      // 混ざると Claude Code の JSON パースが壊れ、フックが機能しなくなる。
      expect(script).not.toMatch(/console\.log/);
      expect(script).toContain('process.stdout.write(JSON.stringify(verdict))');
      expect(script).toContain('process.stderr.write');
    });

    test('ワーカーへの fetch にタイムアウトが付く（無応答で 15 秒ハングするため）', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);

      const script = readScript('agent-status-report.mjs');
      expect(script).toContain('AbortController');
      expect(script).toContain('controller.abort()');
      expect(script).toContain('signal: controller.signal');
    });

    test('判定ロジックは git common dir から読み、未配置なら fail-open', () => {
      const { setupClaudeHooks } = loadModule();
      setupClaudeHooks(tmpWorkspace);

      const script = readScript('agent-status-report.mjs');
      expect(script).toContain('rev-parse --git-common-dir');
      expect(script).toContain('airspace.cjs');
      // バンドル未配置ならゲートを張らずに素通しする
      expect(script).toContain('if (!fs.existsSync(modulePath)) return null;');
      // 脱出口
      expect(script).toContain("process.env.ANYTIME_AIRSPACE === 'off'");
    });
  });
});
