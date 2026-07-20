/**
 * GitHub OAuth 同意画面へ抜けた事実を記録する sessionStorage フラグ群。
 * 同意後に同じページへ戻ってきた時点で中断した操作を自動再開し、ユーザーに 2 度押させない。
 * セッション（タブ）限りの一時的な意図なので sessionStorage を使う。
 */
const INTENT_KEY = 'githubPickerIntent';
const FILE_OPEN_ATTEMPT_KEY = 'githubFileOpenAttempt';

function markSessionFlag(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, '1');
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to mark session flag (${key}):`, err);
  }
}

/** 記録済みなら true を返し、記録を消す（同じ意図で二度発動しないため）。 */
function consumeSessionFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const marked = sessionStorage.getItem(key) === '1';
    if (marked) sessionStorage.removeItem(key);
    return marked;
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to read session flag (${key}):`, err);
    return false;
  }
}

/** 「GitHub から開く」（ピッカー）押下でサインインへ抜けたことを記録する。 */
export function markGitHubPickerIntent(): void {
  markSessionFlag(INTENT_KEY);
}

export function consumeGitHubPickerIntent(): boolean {
  return consumeSessionFlag(INTENT_KEY);
}

/**
 * `/markdown?gh=...`（特定ファイルの直接オープン）からサインインへ誘導したことを記録する。
 * 開くファイル自体は復帰後もクエリに残るため保存せず、「誘導済み」の事実だけを持つ
 * （未接続のまま戻ってきたときに再誘導ループへ入らないためのガード）。
 */
export function markGitHubFileOpenAttempt(): void {
  markSessionFlag(FILE_OPEN_ATTEMPT_KEY);
}

export function consumeGitHubFileOpenAttempt(): boolean {
  return consumeSessionFlag(FILE_OPEN_ATTEMPT_KEY);
}
