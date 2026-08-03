import type { Page } from "@playwright/test";

const STORAGE_KEY = "markdown-editor-content";

/**
 * E2E が対象とするロケール。既定は `en`（既存 spec は英語のアクセシブル名を前提に書かれている）。
 * `E2E_LOCALE=ja` で日本語側を対象にできる。
 */
export const E2E_LOCALE = process.env.E2E_LOCALE ?? "en";

/**
 * ロケールを URL へ明示する。
 *
 * このサイトはロケールを **URL で決める**（`localePrefix: 'as-needed'`・既定 `ja`）。
 * `ja` はプレフィックス無し、`en` は `/en` 配下。エディタの表示言語も `useLocale()`
 * 由来なので、素の `page.goto("/markdown")` は既定ロケールの UI を返す。
 *
 * この seam を通さずにパスを直書きすると、既定ロケールが変わった瞬間に「UI 文言が
 * 変わってアサーションが落ちる」形で spec 全体が同時に落ちる（2026-08-03 に 67 件で実測）。
 * ロケール分離の退行は `locale-routing.spec.ts` が直接検証する。
 */
export function localePath(path: string, locale: string = E2E_LOCALE): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  // 既定ロケール（ja）はプレフィックスを持たない
  if (locale === "ja") return normalized;
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

/**
 * エディタを空の状態で開く。
 * localStorage に空文字を設定してから遷移し、Edit モードに切り替える。
 * 注意: page.goto() の前に addInitScript が必要なため、この関数が goto も実行する。
 */
export async function openEmptyEditor(page: Page, locale: string = E2E_LOCALE): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "");
  }, STORAGE_KEY);
  await page.goto(localePath("/markdown", locale));
  const editor = page.locator(".tiptap");
  await editor.waitFor({ state: "visible" });
  // Review モードの場合は Edit モードに切替
  const editBtn = page.getByRole("button", { name: /^edit$/i });
  if (await editBtn.isVisible()) {
    await editBtn.click();
  }
}
