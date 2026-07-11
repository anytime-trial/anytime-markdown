/**
 * `.mcp.json` への MCP サーバーエントリ自動マージの純粋ロジック。
 * vscode 非依存（jest でユニットテストする）。ファイル I/O は呼び出し側が担う。
 */

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpJsonShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export type AutoMergeResult =
  | { action: 'add'; nextJson: string }
  | { action: 'skip'; reason: 'exists' | 'unparseable' };

/**
 * `.mcp.json` の生テキストに対し、`serverName` エントリが無い場合のみ追加した次版 JSON を返す。
 *
 * 自動登録（activate 時）専用のポリシー:
 * - エントリが既に在れば内容が異なっても**上書きしない**（`skip: exists`）。
 *   ユーザーがソース直起動等へカスタムした構成を壊さないため。上書きしたい場合は
 *   手動コマンド `anytime-markdown.registerMcpServer` を使う。
 * - パース不能・object でない JSON は**書き換えない**（`skip: unparseable`）。
 *   自動経路でのバックアップ退避や新規作成は行わない（ユーザーの気づかない所で
 *   ファイルを動かさない）。
 *
 * @param raw `.mcp.json` の現内容。ファイル不在は null。
 */
export function mergeMcpServerEntryIfMissing(
  raw: string | null,
  serverName: string,
  entry: McpServerEntry,
): AutoMergeResult {
  let existing: McpJsonShape = {};
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { action: 'skip', reason: 'unparseable' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { action: 'skip', reason: 'unparseable' };
    }
    existing = parsed as McpJsonShape;
    // mcpServers が object 以外（文字列・数値・配列）に壊れている場合も throw せずスキップする
    // （本関数は throw しない契約。壊れたファイルには触れない）。
    if (existing.mcpServers !== undefined) {
      if (
        typeof existing.mcpServers !== 'object' ||
        existing.mcpServers === null ||
        Array.isArray(existing.mcpServers)
      ) {
        return { action: 'skip', reason: 'unparseable' };
      }
      if (Object.hasOwn(existing.mcpServers, serverName)) {
        return { action: 'skip', reason: 'exists' };
      }
    }
  }
  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers[serverName] = entry;
  return { action: 'add', nextJson: JSON.stringify(existing, null, 2) + '\n' };
}
