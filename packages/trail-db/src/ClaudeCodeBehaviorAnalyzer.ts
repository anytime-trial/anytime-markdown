// ClaudeCodeBehaviorAnalyzer.ts
// messages テーブルを読んで message_tool_calls テーブルに書き込む。

import type { SqlJsCompatDatabase as Database } from './internal/SqlJsCompatDatabase';
import { classifyErrorType, extractFilePath, extractCommand } from './behaviorAnalysis';
const _log = { info: (m: string) => console.info(m), warn: (m: string) => console.warn(m) };

interface RawMessage {
  uuid: string;
  session_id: string;
  type: string;
  tool_calls: string | null;
  tool_use_result: string | null;
  model: string | null;
  skill: string | null;
  is_sidechain: number;
  timestamp: string;
  parent_uuid: string | null;
}

interface ToolCallBlock {
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

interface ToolResultBlock {
  type: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | unknown[];
}

export class ClaudeCodeBehaviorAnalyzer {
  /**
   * 指定セッションの messages を解析して message_tool_calls に書き込む。
   * 差分スキップ: (message_uuid, call_index) が既存の行はスキップする。
   */
  analyze(sessionId: string, db: Database): void {
    const [assistants, userByParent] = this.loadMessages(db, sessionId);
    if (assistants.length === 0) return;

    let turnIndex = 0;
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO message_tool_calls
        (session_id, message_uuid, turn_index, call_index, tool_name,
         file_path, command, skill_name, model, is_sidechain,
         turn_exec_ms, has_thinking, is_error, error_type, timestamp)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    try {
      for (const msg of assistants) {
        const toolBlocks = this.parseToolBlocks(msg);
        if (!toolBlocks) { turnIndex++; continue; }

        const userMsg = userByParent.get(msg.uuid);
        const turnExecMs = userMsg
          ? Math.max(0, new Date(userMsg.timestamp).getTime() - new Date(msg.timestamp).getTime())
          : null;
        const errorMap = this.buildErrorMap(userMsg?.tool_use_result ?? null);

        for (let callIndex = 0; callIndex < toolBlocks.length; callIndex++) {
          const tool = toolBlocks[callIndex];
          if (!tool?.name) continue;
          this.insertToolCallRow(insertStmt, sessionId, msg, { turnIndex, callIndex, tool, turnExecMs }, errorMap);
        }

        turnIndex++;
      }
    } finally {
      insertStmt.free();
    }

    _log.info(`[ClaudeCodeBehaviorAnalyzer] session=${sessionId} analyzed ${assistants.length} assistant turns`);
  }

  /** Parse tool_calls JSON; returns null if absent, empty, or invalid. */
  private parseToolBlocks(msg: RawMessage): ToolCallBlock[] | null {
    if (!msg.tool_calls) return null;
    let toolBlocks: ToolCallBlock[];
    try {
      toolBlocks = JSON.parse(msg.tool_calls) as ToolCallBlock[];
    } catch (e) {
      _log.warn(`[ClaudeCodeBehaviorAnalyzer] Failed to parse tool_calls for message ${msg.uuid}: ${String(e)}`);
      return null;
    }
    return toolBlocks.length > 0 ? toolBlocks : null;
  }

  /** Insert one row for a single tool call. */
  private insertToolCallRow(
    insertStmt: ReturnType<Database['prepare']>,
    sessionId: string,
    msg: RawMessage,
    opts: { turnIndex: number; callIndex: number; tool: ToolCallBlock; turnExecMs: number | null },
    errorMap: Map<string, { is_error: boolean; content: string }>,
  ): void {
    const { turnIndex, callIndex, tool, turnExecMs } = opts;
    const errorEntry = errorMap.get(tool.id);
    const isError = errorEntry?.is_error ? 1 : 0;
    const errorContent = errorEntry?.content ?? '';
    const errorContentStr = typeof errorContent === 'string' ? errorContent : JSON.stringify(errorContent);
    const errorType = isError ? classifyErrorType(errorContentStr) : null;

    insertStmt.run([
      sessionId,
      msg.uuid,
      turnIndex,
      callIndex,
      tool.name,
      extractFilePath(tool.name, tool.input),
      extractCommand(tool.name, tool.input),
      msg.skill,
      msg.model,
      msg.is_sidechain,
      turnExecMs,
      0, // hasThinking: messages テーブルに情報がないため常に 0
      isError,
      errorType,
      msg.timestamp,
    ]);
  }

  private loadMessages(
    db: Database,
    sessionId: string,
  ): [RawMessage[], Map<string, RawMessage>] {
    const result = db.exec(`
      SELECT uuid, session_id, type, tool_calls, tool_use_result,
             model, skill, is_sidechain, timestamp, parent_uuid
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `, [sessionId]);

    const rows = result[0]?.values ?? [];
    const cols = result[0]?.columns ?? [];

    const toObj = (row: unknown[]): RawMessage =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]])) as unknown as RawMessage;

    const all = rows.map(toObj);
    const assistants = all.filter(m => m.type === 'assistant' && m.tool_calls != null);
    const userByParent = new Map(
      all.filter(m => m.type === 'user').map(m => [m.parent_uuid ?? '', m]),
    );

    return [assistants, userByParent];
  }

  private buildErrorMap(
    toolUseResultJson: string | null,
  ): Map<string, { is_error: boolean; content: string }> {
    const map = new Map<string, { is_error: boolean; content: string }>();
    if (!toolUseResultJson) return map;

    let results: unknown;
    try { results = JSON.parse(toolUseResultJson) as unknown; } catch (e) { _log.warn(`[ClaudeCodeBehaviorAnalyzer] Failed to parse tool_use_result JSON: ${String(e)}`); return map; }

    const items: ToolResultBlock[] = Array.isArray(results) ? results as ToolResultBlock[] : [results as ToolResultBlock];
    for (const item of items) {
      if (item.type === 'tool_result' && item.tool_use_id) {
        map.set(item.tool_use_id, {
          is_error: item.is_error === true,
          content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
        });
      }
    }
    return map;
  }
}
