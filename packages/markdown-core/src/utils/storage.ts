/**
 * localStorage ラッパー — QuotaExceededError を検出しコンソール警告を出す。
 * 読み込みは try/catch 付きの直接呼び出しで十分なため、書き込みのみラップする。
 */

let quotaWarned = false;

/** localStorage.setItem のラッパー。quota 超過時にコンソール警告を出す。 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn("[Anytime Markdown] localStorage quota exceeded. Some settings may not be saved.", e);
    }
    return false;
  }
}

/** localStorage.removeItem のラッパー。 */
export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
