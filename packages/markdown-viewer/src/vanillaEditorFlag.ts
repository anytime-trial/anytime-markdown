/**
 * vanilla editor 経路を有効化するかのフラグ（G3-2 並走切替用）。既定は false（旧 React 経路）。
 *
 * 重量依存（orchestrator / テンプレート）を持たない単独モジュール。consumer の
 * フラグ判定 hook（web-app `useVanillaEditorFlag` 等）が barrel を経由せず deep import できる。
 *
 * 優先順: グローバル明示フラグ `__AM_VANILLA_EDITOR__` → 環境変数 `NEXT_PUBLIC_VANILLA_EDITOR` →
 * URL クエリ `?vanilla=1`（ブラウザ時のみ）。consumer 側で独自判定したい場合は本関数を使わず
 * 直接条件分岐してよい。
 */
export function isVanillaEditorEnabled(): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.__AM_VANILLA_EDITOR__ === "boolean") return g.__AM_VANILLA_EDITOR__;
  const env =
    typeof process !== "undefined"
      ? (process as { env?: Record<string, string | undefined> }).env?.NEXT_PUBLIC_VANILLA_EDITOR
      : undefined;
  if (env === "1" || env === "true") return true;
  if (typeof window !== "undefined") {
    try {
      return new URLSearchParams(window.location.search).get("vanilla") === "1";
    } catch (error) {
      console.warn("[vanillaEditorFlag] URL query parse failed", error);
      return false;
    }
  }
  return false;
}
