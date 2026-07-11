/**
 * Drive UI の「アプリで開く」から来たが未サインインだったため OAuth 同意画面へ抜けた、
 * という事実を記録する。同意後に戻ってきた時点で同じファイルを開き直す。
 *
 * `githubPickerIntent` と違い boolean では足りない。どのファイルを開こうとしたかは
 * `state` の中身にしかないため、生の state 文字列をそのまま保持する。
 * セッション（タブ）限りの一時的な意図なので sessionStorage を使う。
 */
const INTENT_KEY = 'driveOpenIntent';

export function markDriveOpenIntent(rawState: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(INTENT_KEY, rawState);
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to mark Drive open intent:`, err);
  }
}

/** 記録済みなら生の state を返し、記録を消す（同じ意図で二度開かないため）。 */
export function consumeDriveOpenIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (raw !== null) sessionStorage.removeItem(INTENT_KEY);
    return raw;
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Failed to read Drive open intent:`, err);
    return null;
  }
}
