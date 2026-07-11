/**
 * 本文下書き（`STORAGE_KEY_CONTENT`）の読み書きを一箇所に閉じ込める。
 *
 * かつては markdown-viewer（編集のたびに debounce 書き込み）と web-app（外部ソースから開いた
 * 直後の同期書き込み）が同じキーを直接 `localStorage.setItem` していた。競合は「open 直後に
 * 書いて remount し、以後はエディタ側が上書きする」という暗黙の順序前提だけで回避されており、
 * どちらが正本かは型にも命名にも現れていなかった。
 *
 * 本モジュールを唯一の書き込み口とし、生の `localStorage` 直叩きを禁じる。エラーは握り潰さず
 * 警告として出す（下書きの喪失はユーザーに見える事象のため）。
 *
 * SSR / localStorage が使えない環境では読み込みは既定値を返し、書き込みは黙って何もしない
 * （下書きは best-effort な機能であり、保存の正本ではない）。
 */

import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";

/**
 * localStorage が使えるか。
 *
 * ブラウザ API アクセス前のガードは `typeof window !== "undefined"` を使う（`globalThis` は
 * Node.js（SSR）でも定義されるためブラウザ判定にならない）。実際の getItem / setItem は
 * プライベートブラウジング等で throw しうるため、呼び元で個別に try/catch する。
 */
function available(): boolean {
  return typeof window !== "undefined";
}

/** 下書きを読む。未保存・読み取り失敗時は `fallback` を返す。 */
export function readDraft(fallback: string): string {
  if (!available()) return fallback;
  try {
    return localStorage.getItem(STORAGE_KEY_CONTENT) ?? fallback;
  } catch (error) {
    console.warn("[draftStorage] read failed", error);
    return fallback;
  }
}

/**
 * 下書きを書く。
 *
 * 外部ソース（Google Drive / GitHub）から開いた本文を、エディタの再マウント前に流し込む用途でも
 * 使う。エディタ側は `persistDraft` 時に本値を `initialContent` より優先して読む。
 */
export function writeDraft(content: string): void {
  if (!available()) return;
  try {
    localStorage.setItem(STORAGE_KEY_CONTENT, content);
  } catch (error) {
    console.warn("[draftStorage] write failed", error);
  }
}

/** 下書きを消す。 */
export function clearDraft(): void {
  if (!available()) return;
  try {
    localStorage.removeItem(STORAGE_KEY_CONTENT);
  } catch (error) {
    console.warn("[draftStorage] clear failed", error);
  }
}
