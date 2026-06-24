import type { VanillaMarkdownEditorUpdatePatch } from "./vanillaMarkdownEditor";

/**
 * settings オブジェクトの等価判定。
 * `buildEditorSettings()` はキー順が安定したビルダなので JSON 文字列比較で足りる。
 */
function settingsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 直前に送った live patch（`prev`）と現在値（`next`）を比較し、
 * **変化したキーのみ**を含む差分 patch を返す。
 *
 * live patch の sink には冪等でない副作用（`autoReload` の baseline 再取得、
 * settings の再適用）があるため、値が変わっていないキーを送ると
 * 変更 gutter マーカーの消失などの回帰を招く。source 側で差分のみ送ることで防ぐ。
 */
export function diffLivePatch(
  prev: VanillaMarkdownEditorUpdatePatch,
  next: VanillaMarkdownEditorUpdatePatch,
): VanillaMarkdownEditorUpdatePatch {
  const diff: VanillaMarkdownEditorUpdatePatch = {};
  const out = diff as Record<string, unknown>;
  for (const key of Object.keys(next) as (keyof VanillaMarkdownEditorUpdatePatch)[]) {
    if (key === "settings") {
      if (!settingsEqual(prev.settings, next.settings)) out.settings = next.settings;
      continue;
    }
    if (!Object.is(prev[key], next[key])) out[key] = next[key];
  }
  return diff;
}
