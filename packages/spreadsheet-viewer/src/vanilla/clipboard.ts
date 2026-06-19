/**
 * グリッドのクリップボード操作ユーティリティ。
 *
 * VS Code webview では `navigator.clipboard` が制限され、`writeText` / `readText` が reject される。
 * そのため以下のフォールバックを用意し、webview でもグリッドのコピー/ペーストを成立させる。
 *
 * - 書き込み: `execCommand("copy")` にフォールバックしてシステムクリップボードへ書く。
 *   加えて、いずれの経路でも内部バッファを **同期的に** 更新する（グリッド内コピー→ペーストの保証）。
 * - 読み取り: `navigator.clipboard.readText` が使えない/空のときは内部バッファにフォールバックする。
 *
 * `markdown-viewer/utils/clipboardHelpers` と同方針だが、`markdown-viewer` → `spreadsheet-viewer` の
 * 依存があるため逆 import は循環になる。本パッケージ内に独立して持つ。
 */

// グリッド内コピー→ペースト用のフォールバックバッファ。
// navigator.clipboard / システムクリップボード読み取りが使えない環境（VS Code webview）で、
// 直近にグリッドからコピーした TSV を保持する。コピー操作のたびに同期更新される。
let internalClipboardBuffer = "";

/** 直近にコピーした TSV を内部バッファへ保存する（全コピー経路で更新する）。 */
export function setInternalClipboard(tsv: string): void {
  internalClipboardBuffer = tsv;
}

/** 内部バッファの現在値を返す（テスト・診断用）。 */
export function getInternalClipboard(): string {
  return internalClipboardBuffer;
}

/** 非表示 textarea + `execCommand("copy")` でシステムクリップボードへ書く。成否を返す。 */
function writeViaExecCommand(tsv: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = tsv;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.setAttribute("aria-hidden", "true");
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    // VS Code webview では navigator.clipboard が使えないため execCommand を残す（意図的な deprecated 利用）
    ok = document.execCommand("copy");
  } catch (err) {
    console.warn("[SpreadsheetGrid] execCommand copy failed", err);
  }
  textarea.remove();
  return ok;
}

/**
 * TSV をクリップボードへ書き込む。
 *
 * 内部バッファは **同期的に** 更新するため、システムクリップボードへの書き込み可否に関わらず
 * グリッド内のコピー→ペーストは常に成立する。
 * システムクリップボードへは `navigator.clipboard.writeText`、不可時は `execCommand("copy")` で書く。
 */
export async function writeTsvToClipboard(tsv: string): Promise<void> {
  setInternalClipboard(tsv);
  try {
    await navigator.clipboard.writeText(tsv);
  } catch (err) {
    // Clipboard API 不可（VS Code webview 等）— execCommand フォールバック
    if (!writeViaExecCommand(tsv)) {
      console.warn("[SpreadsheetGrid] clipboard write failed", err);
    }
  }
}

/**
 * クリップボードから TSV を読む。
 *
 * `navigator.clipboard.readText` が使えない/空のとき（VS Code webview 等）は、
 * 内部バッファ（直近のグリッド内コピー）にフォールバックする。常に文字列を返し reject しない。
 */
export async function readTsvFromClipboard(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  } catch {
    // navigator.clipboard.readText 不可 — 内部バッファにフォールバック
  }
  return internalClipboardBuffer;
}
