import { test, expect } from "@playwright/test";

const STORAGE_KEY = "markdown-editor-content";

// 8 列のワイドテーブル（各セル min-width:80px ＝ 約 640px+ で狭幅ビューポートを超える）。
const WIDE_TABLE_MD = [
  "| A | B | C | D | E | F | G | H |",
  "| - | - | - | - | - | - | - | - |",
  "| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |",
  "",
].join("\n");

test.describe("狭幅でのテーブル横スクロール", () => {
  test("モバイル幅で .tableWrapper が横スクロール可能になる", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.addInitScript(
      ([key, md]) => {
        localStorage.setItem(key, md);
      },
      [STORAGE_KEY, WIDE_TABLE_MD] as const,
    );
    await page.goto("/markdown");

    const wrapper = page.locator(".tiptap .tableWrapper").first();
    await wrapper.waitFor({ state: "visible" });

    // computed overflow-x が auto/scroll であること
    const overflowX = await wrapper.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(["auto", "scroll"]).toContain(overflowX);

    // 内容が容器より広く、横スクロール可能であること
    const { scrollWidth, clientWidth } = await wrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // 実際にスクロールが効くこと（scrollLeft を設定して反映される）
    const scrolled = await wrapper.evaluate((el) => {
      el.scrollLeft = 9999;
      return el.scrollLeft;
    });
    expect(scrolled).toBeGreaterThan(0);

    // ラッパー自身は本文（ビューポート）幅を超えないこと
    const clientVsViewport = await wrapper.evaluate(
      (el) => el.clientWidth <= globalThis.innerWidth,
    );
    expect(clientVsViewport).toBe(true);
  });
});
