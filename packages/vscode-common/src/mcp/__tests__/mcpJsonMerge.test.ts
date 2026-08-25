import { reconcileMcpServerEntry } from '../mcpJsonMerge';

const ENTRY = {
  command: '/usr/bin/node',
  args: ['/ext/current/dist/server.js'],
  env: { TRAIL_WORKSPACE_PATH: '/ws', TRAIL_SERVER_URL: 'http://localhost:19841' },
};
const existingPaths = new Set(['/usr/bin/node', '/ext/current/dist/server.js']);
const pathExists = (absolutePath: string) => existingPaths.has(absolutePath);

describe('reconcileMcpServerEntry', () => {
  test('ファイル不在なら追加する', () => {
    const result = reconcileMcpServerEntry(null, 'mcp-test', ENTRY, { pathExists });
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    expect(JSON.parse(result.nextJson).mcpServers['mcp-test']).toEqual(ENTRY);
    expect(result.nextJson.endsWith('\n')).toBe(true);
  });

  test('他トップレベルキーと他サーバーを保持して追加する', () => {
    const raw = JSON.stringify({
      keep: { enabled: true },
      mcpServers: { other: { command: 'npx', args: ['other-server'] } },
    });
    const result = reconcileMcpServerEntry(raw, 'mcp-test', ENTRY, { pathExists });
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    const parsed = JSON.parse(result.nextJson);
    expect(parsed.keep).toEqual({ enabled: true });
    expect(parsed.mcpServers.other).toEqual({ command: 'npx', args: ['other-server'] });
  });

  test('等価な既存エントリは up-to-date としてスキップする（空 env と未定義も等価）', () => {
    expect(reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': ENTRY } }), 'mcp-test', ENTRY, { pathExists })).toEqual({ action: 'skip', reason: 'up-to-date' });
    expect(reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': { command: 'npx', args: ['server'] } } }), 'mcp-test', { command: 'npx', args: ['server'], env: {} }, { pathExists })).toEqual({ action: 'skip', reason: 'up-to-date' });
  });

  test('拡張更新後の消えた args[0] は更新する', () => {
    const stale = { ...ENTRY, args: ['/ext/old/dist/server.js'] };
    const result = reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': stale } }), 'mcp-test', ENTRY, { pathExists });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toContain('args-missing:/ext/old/dist/server.js');
    expect(JSON.parse(result.nextJson).mcpServers['mcp-test']).toEqual(ENTRY);
  });

  test('実在しない絶対 command は更新する', () => {
    const result = reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': { ...ENTRY, command: '/old/node' } } }), 'mcp-test', ENTRY, { pathExists });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toContain('command-missing:/old/node');
  });

  test('廃止 env が残っていれば更新する', () => {
    const existing = { ...ENTRY, env: { ...ENTRY.env, ANYTIME_GRAPH_ROOT: '/ws' } };
    const result = reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': existing } }), 'mcp-test', ENTRY, { pathExists, obsoleteEnvKeys: ['ANYTIME_GRAPH_ROOT'] });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toContain('obsolete-env:ANYTIME_GRAPH_ROOT');
  });

  test('管理 env の値が違えば更新する', () => {
    const existing = { ...ENTRY, env: { ...ENTRY.env, TRAIL_WORKSPACE_PATH: '/old' } };
    const result = reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': existing } }), 'mcp-test', ENTRY, { pathExists, managedEnvKeys: ['TRAIL_WORKSPACE_PATH'] });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toContain('env-drift:TRAIL_WORKSPACE_PATH');
  });

  test('ユーザーが npx tsx のソース直起動へ変えた場合は customized として保持する', () => {
    const custom = { command: 'npx', args: ['tsx', 'packages/mcp-test/src/stdio.ts'] };
    expect(reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': custom } }), 'mcp-test', ENTRY, { pathExists })).toEqual({ action: 'skip', reason: 'customized' });
  });

  test('TRAIL_SERVER_URL だけのユーザー変更は customized として保持する', () => {
    const custom = { ...ENTRY, env: { ...ENTRY.env, TRAIL_SERVER_URL: 'http://localhost:30000' } };
    expect(reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': custom } }), 'mcp-test', ENTRY, { pathExists, managedEnvKeys: ['TRAIL_WORKSPACE_PATH'] })).toEqual({ action: 'skip', reason: 'customized' });
  });

  test('壊れた既存エントリは malformed-entry として更新する', () => {
    const result = reconcileMcpServerEntry(JSON.stringify({ mcpServers: { 'mcp-test': { command: 'node', args: 'bad' } } }), 'mcp-test', ENTRY, { pathExists });
    expect(result.action).toBe('update');
    if (result.action !== 'update') return;
    expect(result.staleReasons).toEqual(['malformed-entry']);
  });

  test.each([
    ['パース不能 JSON', '{ broken'],
    ['root 配列', '[]'],
    ['root 文字列', '"text"'],
    ['mcpServers 文字列', '{"mcpServers":"bad"}'],
    ['mcpServers 配列', '{"mcpServers":[]}'],
  ])('%s は unparseable としてスキップする', (_label, raw) => {
    expect(reconcileMcpServerEntry(raw, 'mcp-test', ENTRY, { pathExists })).toEqual({ action: 'skip', reason: 'unparseable' });
  });
});
