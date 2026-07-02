import * as path from 'node:path';
import { isWithinRoot } from '../utils/linkedMdFs';

function defaultDbPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.anytime', 'markdown', 'doc-core.db');
}

/**
 * 検索側（mcp-markdown）と ingest 側で一致させる doc-core.db パス解決。
 * 既定 `<workspace>/.anytime/markdown/doc-core.db`。
 * doc-core を import しない軽量モジュール（extension.js / provider から参照するため）。
 *
 * `configured`（`anytimeMarkdown.docSearch.dbPath`）はワークスペースルート配下に限定する。
 * 未信頼ワークスペースの `.vscode/settings.json` 経由で任意パスへ sqlite DB を作成/上書き
 * させないための境界チェック（多層防御。呼び出し側の isTrusted ガードとセット）。
 * 相対パスは workspaceRoot 基準で解決し、絶対パス・`..` トラバーサルでルート外を指す場合は
 * 既定パスへフォールバックし `warn` へ理由を通知する（呼び出し元が MarkdownLogger を注入する
 * 必須引数。no-op 既定値は禁止＝呼び出し側で必ず配線する）。
 */
export function resolveDocDbPath(
  workspaceRoot: string,
  configured: string | undefined,
  warn: (message: string) => void,
): string {
  const fallback = defaultDbPath(workspaceRoot);
  const c = configured?.trim();
  if (!c) return fallback;

  const resolved = path.resolve(workspaceRoot, c);
  if (!isWithinRoot(resolved, workspaceRoot)) {
    warn(
      `anytimeMarkdown.docSearch.dbPath がワークスペースルート外を指しているため既定パスへフォールバックしました: ${c}`,
    );
    return fallback;
  }
  return resolved;
}
