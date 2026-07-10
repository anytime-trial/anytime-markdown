/**
 * 「GitHub から開く」を押して OAuth 同意画面へ抜けた事実を記録する。
 * 同意後に同じページへ戻ってきた時点でピッカーを自動で開き、ユーザーに 2 度押させない。
 * セッション（タブ）限りの一時的な意図なので sessionStorage を使う。
 */
const INTENT_KEY = 'githubPickerIntent';

export function markGitHubPickerIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(INTENT_KEY, '1');
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to mark GitHub picker intent:`, err);
  }
}

/** 記録済みなら true を返し、記録を消す（同じ意図で二度開かないため）。 */
export function consumeGitHubPickerIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const marked = sessionStorage.getItem(INTENT_KEY) === '1';
    if (marked) sessionStorage.removeItem(INTENT_KEY);
    return marked;
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to read GitHub picker intent:`, err);
    return false;
  }
}
