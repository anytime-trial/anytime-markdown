/**
 * リモート (Supabase / PostgREST) 呼び出しのリトライ判定と、エラー要約。
 *
 * 一過性 (ネットワーク断・ゲートウェイ 5xx・接続過多・statement timeout) と
 * 恒久 (制約違反・スキーマ不整合・認証) を分離する。恒久エラーを再試行しても
 * 同じ結果になるだけなので、即座に throw して呼び出し元へ返す。
 */

export interface RemoteErrorLike {
  readonly message: string;
  readonly code?: string | null;
}

/**
 * 再試行しても結果が変わらない SQLSTATE クラス。
 * 22 = data exception / 23 = integrity constraint violation / 42 = syntax or access rule violation。
 */
const NON_RETRYABLE_SQLSTATE_CLASSES = ['22', '23', '42'];

/** ゲートウェイが返す HTML エラーページ（PostgREST の JSON ではない）を検出する。 */
export function isHtmlErrorPage(message: string): boolean {
  return /^\s*<(!doctype|html)\b/i.test(message);
}

export function isRetryableRemoteError(error: RemoteErrorLike): boolean {
  const code = error.code ?? '';
  // PostgREST が返す SQLSTATE。制約違反・型不正・スキーマ不整合は再試行しても無駄。
  if (/^\d{5}$/.test(code)) {
    return !NON_RETRYABLE_SQLSTATE_CLASSES.includes(code.slice(0, 2));
  }
  // PGRST1xx/2xx/3xx はリクエスト/スキーマ/認証の不正。
  if (code.startsWith('PGRST')) return false;
  // code なし = fetch 層の例外、ゲートウェイの HTML エラーページ、タイムアウト等。一過性とみなす。
  return true;
}

/** ログ・例外メッセージ用にエラーを 1 行へ要約する（HTML ページ全文の垂れ流しを防ぐ）。 */
export function summarizeRemoteError(error: RemoteErrorLike): string {
  const code = error.code ? `[${error.code}] ` : '';
  if (isHtmlErrorPage(error.message)) {
    return `${code}non-JSON response from gateway (HTML error page, ${error.message.length} bytes)`;
  }
  const message = error.message.length > 300
    ? `${error.message.slice(0, 300)}...`
    : error.message;
  return `${code}${message}`;
}
