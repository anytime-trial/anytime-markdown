import { mergeMcpServerEntryIfMissing } from '../mcpJsonMerge';

const ENTRY = {
  command: '/usr/bin/node',
  args: ['/ext/dist/mcp-markdown-server.js'],
  env: { ANYTIME_MARKDOWN_ROOT: '/ws' },
};

describe('mergeMcpServerEntryIfMissing', () => {
  test('ファイル不在（null）なら新規 JSON を生成して追加する', () => {
    const result = mergeMcpServerEntryIfMissing(null, 'mcp-markdown', ENTRY);
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    const parsed = JSON.parse(result.nextJson);
    expect(parsed.mcpServers['mcp-markdown']).toEqual(ENTRY);
    // 末尾改行付きの整形 JSON（手動編集と diff が安定する）
    expect(result.nextJson.endsWith('\n')).toBe(true);
  });

  test('mcpServers に対象が無ければ既存エントリを保持したまま追加する', () => {
    const raw = JSON.stringify(
      { mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp@latest'] } } },
      null,
      2,
    );
    const result = mergeMcpServerEntryIfMissing(raw, 'mcp-markdown', ENTRY);
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    const parsed = JSON.parse(result.nextJson);
    expect(parsed.mcpServers.playwright.command).toBe('npx');
    expect(parsed.mcpServers['mcp-markdown']).toEqual(ENTRY);
  });

  test('既存の mcp-markdown エントリがあれば内容が異なっても上書きしない（skip: exists）', () => {
    // 例: 本リポジトリはソース直起動 (tsx) のカスタムエントリを持つ。自動登録で壊してはならない。
    const raw = JSON.stringify(
      {
        mcpServers: {
          'mcp-markdown': { command: 'npx', args: ['tsx', 'packages/mcp-markdown/src/stdio.ts'] },
        },
      },
      null,
      2,
    );
    const result = mergeMcpServerEntryIfMissing(raw, 'mcp-markdown', ENTRY);
    expect(result).toEqual({ action: 'skip', reason: 'exists' });
  });

  test('パース不能な JSON は書き換えずスキップする（skip: unparseable）', () => {
    const result = mergeMcpServerEntryIfMissing('not valid json {', 'mcp-markdown', ENTRY);
    expect(result).toEqual({ action: 'skip', reason: 'unparseable' });
  });

  test('mcpServers 以外のトップレベルキーを保持する', () => {
    const raw = JSON.stringify({ otherTopLevel: { keep: true }, mcpServers: {} }, null, 2);
    const result = mergeMcpServerEntryIfMissing(raw, 'mcp-markdown', ENTRY);
    expect(result.action).toBe('add');
    if (result.action !== 'add') return;
    const parsed = JSON.parse(result.nextJson);
    expect(parsed.otherTopLevel).toEqual({ keep: true });
  });

  test('JSON だが object でない（配列・文字列）場合は unparseable としてスキップする', () => {
    expect(mergeMcpServerEntryIfMissing('[]', 'mcp-markdown', ENTRY)).toEqual({
      action: 'skip',
      reason: 'unparseable',
    });
    expect(mergeMcpServerEntryIfMissing('"text"', 'mcp-markdown', ENTRY)).toEqual({
      action: 'skip',
      reason: 'unparseable',
    });
  });

  test('mcpServers が object でない（文字列・数値・配列）場合も throw せず unparseable でスキップする', () => {
    // 契約: 本関数は throw しない。壊れた mcpServers はファイルに触れないシグナルを返す。
    for (const raw of ['{"mcpServers":"foo"}', '{"mcpServers":42}', '{"mcpServers":[]}']) {
      expect(mergeMcpServerEntryIfMissing(raw, 'mcp-markdown', ENTRY)).toEqual({
        action: 'skip',
        reason: 'unparseable',
      });
    }
  });
});
