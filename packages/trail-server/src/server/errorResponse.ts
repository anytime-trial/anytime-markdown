import type * as http from 'node:http';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * 500 エラーレスポンスを返す。クライアントには汎用メッセージのみ送り、
 * `Error.message` / `Error.stack` をそのまま JSON 化しない。
 *
 * - 詳細はサーバー側 logger に出力済の想定 (呼び出し前に logger.error する)
 * - CodeQL `js/stack-trace-exposure` 対策。trail-server は localhost 限定で
 *   実用上は webview 同居だが、機微なスタックトレースを HTTP に流さない方針に揃える。
 */
export function sendServerError(res: http.ServerResponse, message = 'Internal server error'): void {
  res.writeHead(500, JSON_HEADERS);
  res.end(JSON.stringify({ error: message }));
}
