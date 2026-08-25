import { detectStaleReasons, formatStaleReason, reconcileMcpServerEntry } from '../mcpJsonMerge';
import type { McpServerEntry, StalenessPolicy } from '../mcpJsonMerge';

const DIST = '/ext/anytime.anytime-markdown-1.23.0/dist';
const OLD_DIST = '/ext/anytime.anytime-markdown-1.22.0/dist';
const NODE = '/vscode-server/node';

const ENTRY: McpServerEntry = { command: NODE, args: [`${DIST}/mcp-markdown-server.js`] };

/** 現行環境に実在するパス。旧バージョンの dist は削除済みという状況を模す。 */
const EXISTING = new Set([NODE, `${DIST}/mcp-markdown-server.js`, '/ws/tsconfig.json']);
const POLICY: StalenessPolicy = { pathExists: (p) => EXISTING.has(p) };

function json(servers: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, mcpServers: servers }, null, 2);
}

function parsedEntry(result: { action: string; nextJson?: string }, name = 'mcp-markdown'): Record<string, unknown> {
  if (!('nextJson' in result) || result.nextJson === undefined) throw new Error('nextJson がありません');
  return JSON.parse(result.nextJson).mcpServers[name];
}

describe('reconcileMcpServerEntry', () => {
  test('ファイル不在なら追加する', () => {
    const result = reconcileMcpServerEntry(null, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('add');
    expect(parsedEntry(result)).toEqual(ENTRY);
    if (result.action !== 'add') return;
    // 末尾改行付きの整形 JSON（手動編集と diff が安定する）
    expect(result.nextJson.endsWith('\n')).toBe(true);
  });

  test('他トップレベルキーと他サーバーを保持して追加する', () => {
    const raw = json({ playwright: { command: 'npx', args: ['@playwright/mcp@latest'] } }, { other: { keep: true } });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    const parsed = JSON.parse(result.nextJson);
    expect(parsed.other).toEqual({ keep: true });
    expect(parsed.mcpServers.playwright.command).toBe('npx');
  });

  test('等価な既存エントリは up-to-date としてスキップする（空 env と未定義は等価）', () => {
    const raw = json({ 'mcp-markdown': { ...ENTRY, env: {} } });
    expect(reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY)).toEqual({
      action: 'skip',
      reason: 'up-to-date',
    });
  });

  test('拡張更新で消えた args のパスを書き直す', () => {
    const raw = json({ 'mcp-markdown': { command: NODE, args: [`${OLD_DIST}/mcp-markdown-server.js`] } });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([
      { kind: 'args-missing', path: `${OLD_DIST}/mcp-markdown-server.js` },
    ]);
    expect(parsedEntry(result)).toEqual(ENTRY);
  });

  test('実在しない絶対 command を書き直す', () => {
    const raw = json({ 'mcp-markdown': { command: '/old/node', args: [`${DIST}/mcp-markdown-server.js`] } });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([{ kind: 'command-missing', path: '/old/node' }]);
  });

  test('起動パスが args[1] 以降にあっても不在を検知する', () => {
    const raw = json({
      'mcp-markdown': { command: NODE, args: ['--enable-source-maps', `${OLD_DIST}/mcp-markdown-server.js`] },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([
      { kind: 'args-missing', path: `${OLD_DIST}/mcp-markdown-server.js` },
    ]);
  });

  test('廃止 env は当該キーだけを削り、他のキーと未知フィールドは残す', () => {
    const raw = json({
      'mcp-markdown': {
        ...ENTRY,
        cwd: '/ws',
        env: { ANYTIME_MARKDOWN_ROOT: '/stale', ANYTIME_MARKDOWN_DOC_DB: '/ws/catalog.db' },
      },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, {
      ...POLICY,
      obsoleteEnvKeys: ['ANYTIME_MARKDOWN_ROOT'],
    });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([{ kind: 'obsolete-env', key: 'ANYTIME_MARKDOWN_ROOT' }]);
    expect(parsedEntry(result)).toEqual({
      ...ENTRY,
      cwd: '/ws',
      env: { ANYTIME_MARKDOWN_DOC_DB: '/ws/catalog.db' },
    });
  });

  test('管理 env のドリフトは当該キーだけを直し、利用者の command / args は保つ', () => {
    // 実運用の形: npx tsx によるソース直起動 + cwd。TRAIL_WORKSPACE_PATH だけが現行と食い違う。
    const trailEntry: McpServerEntry = {
      command: NODE,
      args: [`${DIST}/mcp-trail-server.js`],
      env: { TRAIL_SERVER_URL: 'http://localhost:19841', TRAIL_WORKSPACE_PATH: '/ws' },
    };
    const raw = json({
      'mcp-trail': {
        command: 'npx',
        args: ['tsx', 'packages/mcp-trail/src/stdio.ts'],
        cwd: '/ws',
        env: { TRAIL_SERVER_URL: 'http://localhost:29841', TRAIL_WORKSPACE_PATH: '/old-ws' },
      },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-trail', trailEntry, {
      ...POLICY,
      managedEnvKeys: ['TRAIL_WORKSPACE_PATH'],
    });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([{ kind: 'env-drift', key: 'TRAIL_WORKSPACE_PATH' }]);
    expect(parsedEntry(result, 'mcp-trail')).toEqual({
      command: 'npx',
      args: ['tsx', 'packages/mcp-trail/src/stdio.ts'],
      cwd: '/ws',
      // 利用者が変えたポートは戻らない
      env: { TRAIL_SERVER_URL: 'http://localhost:29841', TRAIL_WORKSPACE_PATH: '/ws' },
    });
  });

  test('管理 env が既存に無ければ追加する（新設キーの導入）', () => {
    const trailEntry: McpServerEntry = {
      command: NODE,
      args: [`${DIST}/mcp-trail-server.js`],
      env: { TRAIL_SERVER_URL: 'http://localhost:19841', TRAIL_WORKSPACE_PATH: '/ws' },
    };
    const raw = json({
      'mcp-trail': { command: 'npx', args: ['tsx', 'packages/mcp-trail/src/stdio.ts'], cwd: '/ws' },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-trail', trailEntry, {
      ...POLICY,
      managedEnvKeys: ['TRAIL_WORKSPACE_PATH'],
    });
    expect(result.action).toBe('update');
    expect(parsedEntry(result, 'mcp-trail')).toEqual({
      command: 'npx',
      args: ['tsx', 'packages/mcp-trail/src/stdio.ts'],
      cwd: '/ws',
      env: { TRAIL_WORKSPACE_PATH: '/ws' },
    });
  });

  test('パスを書き直すときも未知フィールドと管理外 env を保つ', () => {
    const raw = json({
      'mcp-markdown': {
        command: NODE,
        args: [`${OLD_DIST}/mcp-markdown-server.js`],
        cwd: '/ws',
        env: { ANYTIME_MARKDOWN_DOC_DB: '/ws/catalog.db' },
      },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('update');
    expect(parsedEntry(result)).toEqual({
      command: NODE,
      args: [`${DIST}/mcp-markdown-server.js`],
      cwd: '/ws',
      env: { ANYTIME_MARKDOWN_DOC_DB: '/ws/catalog.db' },
    });
  });

  test('ユーザーが npx tsx のソース直起動へ変えた場合は customized として保持する', () => {
    const raw = json({
      'mcp-markdown': {
        command: 'npx',
        args: ['tsx', '--tsconfig', '/ws/tsconfig.json', 'packages/mcp-markdown/src/stdio.ts'],
        cwd: '/ws',
      },
    });
    expect(reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY)).toEqual({
      action: 'skip',
      reason: 'customized',
    });
  });

  test('管理外 env（TRAIL_SERVER_URL）だけのユーザー変更は customized として保持する', () => {
    const trailEntry: McpServerEntry = {
      command: NODE,
      args: [`${DIST}/mcp-trail-server.js`],
      env: { TRAIL_SERVER_URL: 'http://localhost:19841', TRAIL_WORKSPACE_PATH: '/ws' },
    };
    EXISTING.add(`${DIST}/mcp-trail-server.js`);
    const raw = json({
      'mcp-trail': {
        command: NODE,
        args: [`${DIST}/mcp-trail-server.js`],
        env: { TRAIL_SERVER_URL: 'http://localhost:29841', TRAIL_WORKSPACE_PATH: '/ws' },
      },
    });
    expect(
      reconcileMcpServerEntry(raw, 'mcp-trail', trailEntry, {
        ...POLICY,
        managedEnvKeys: ['TRAIL_WORKSPACE_PATH'],
      }),
    ).toEqual({ action: 'skip', reason: 'customized' });
    EXISTING.delete(`${DIST}/mcp-trail-server.js`);
  });

  test.each([
    ['args が配列でない', { command: NODE, args: 'bad' }],
    ['args が空配列', { command: NODE, args: [] }],
    ['command が文字列でない', { command: 42, args: [`${DIST}/mcp-markdown-server.js`] }],
    ['env が object でない', { ...ENTRY, env: 'invalid' }],
    ['env の値が文字列でない', { ...ENTRY, env: { KEY: 123 } }],
  ])('壊れた既存エントリ（%s）は malformed-entry として生成値で置き換える', (_label, entry) => {
    const raw = json({ 'mcp-markdown': entry });
    const result = reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY);
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual([{ kind: 'malformed-entry' }]);
    expect(parsedEntry(result)).toEqual(ENTRY);
  });

  test.each([
    ['パース不能 JSON', '{ broken'],
    ['root 配列', '[]'],
    ['root 文字列', '"text"'],
    ['mcpServers 文字列', '{"mcpServers":"bad"}'],
    ['mcpServers 配列', '{"mcpServers":[]}'],
  ])('%s は unparseable としてスキップする', (_label, raw) => {
    expect(reconcileMcpServerEntry(raw, 'mcp-markdown', ENTRY, POLICY)).toEqual({
      action: 'skip',
      reason: 'unparseable',
    });
  });
});

describe('detectStaleReasons', () => {
  test('現行環境で解決できるエントリは理由 0 件（＝触ってはいけない合図）', () => {
    expect(detectStaleReasons({ command: 'npx', args: ['tsx', 'src/stdio.ts'] }, ENTRY, POLICY)).toEqual([]);
  });

  test('相対パスは実在検査の対象にしない', () => {
    expect(
      detectStaleReasons({ command: 'node', args: ['dist/does-not-exist.js'] }, ENTRY, POLICY),
    ).toEqual([]);
  });
});

describe('formatStaleReason', () => {
  test('通知・ログ用の 1 行表現へ落とす', () => {
    expect(formatStaleReason({ kind: 'malformed-entry' })).toBe('malformed-entry');
    expect(formatStaleReason({ kind: 'command-missing', path: '/a' })).toBe('command-missing:/a');
    expect(formatStaleReason({ kind: 'args-missing', path: '/b' })).toBe('args-missing:/b');
    expect(formatStaleReason({ kind: 'env-drift', key: 'K' })).toBe('env-drift:K');
    expect(formatStaleReason({ kind: 'obsolete-env', key: 'K' })).toBe('obsolete-env:K');
  });
});
