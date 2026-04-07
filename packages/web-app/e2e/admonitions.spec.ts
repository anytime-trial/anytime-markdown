import { test, expect } from "./coverage.fixture";
import { openEmptyEditor } from "./helpers";

test.describe("Admonitions", () => {
  test.beforeEach(async ({ page }) => {
    await openEmptyEditor(page);
  });

  test("/note inserts NOTE admonition via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/admonition");
    const menu = page.getByRole("menu", { name: "Type to filter..." });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem").first().click();
    // スラッシュコマンドで blockquote が挿入される
    await expect(editor.locator("blockquote")).toBeVisible();
  });

  test("NOTE admonition renders from markdown source", async ({ page }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("> [!NOTE]\n> Note content");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(
      editor.locator("blockquote[data-admonition-type='note']"),
    ).toBeVisible();
  });

  test("TIP admonition renders from markdown source", async ({ page }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("> [!TIP]\n> Tip content");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(
      editor.locator("blockquote[data-admonition-type='tip']"),
    ).toBeVisible();
  });

  test("IMPORTANT admonition renders from markdown source", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("> [!IMPORTANT]\n> Important content");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(
      editor.locator("blockquote[data-admonition-type='important']"),
    ).toBeVisible();
  });

  test("WARNING admonition renders from markdown source", async ({ page }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("> [!WARNING]\n> Warning content");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(
      editor.locator("blockquote[data-admonition-type='warning']"),
    ).toBeVisible();
  });

  test("CAUTION admonition renders from markdown source", async ({ page }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("> [!CAUTION]\n> Caution content");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");
    await expect(
      editor.locator("blockquote[data-admonition-type='caution']"),
    ).toBeVisible();
  });

  test("all 5 admonition types render with correct attribute", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill(
      [
        "> [!NOTE]",
        "> Note content",
        "",
        "> [!TIP]",
        "> Tip content",
        "",
        "> [!IMPORTANT]",
        "> Important content",
        "",
        "> [!WARNING]",
        "> Warning content",
        "",
        "> [!CAUTION]",
        "> Caution content",
      ].join("\n"),
    );

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.locator(".tiptap");

    // 5 種類すべてが正しい data-admonition-type 属性でレンダリングされる
    await expect(
      editor.locator("blockquote[data-admonition-type='note']"),
    ).toBeVisible();
    await expect(
      editor.locator("blockquote[data-admonition-type='tip']"),
    ).toBeVisible();
    await expect(
      editor.locator("blockquote[data-admonition-type='important']"),
    ).toBeVisible();
    await expect(
      editor.locator("blockquote[data-admonition-type='warning']"),
    ).toBeVisible();
    await expect(
      editor.locator("blockquote[data-admonition-type='caution']"),
    ).toBeVisible();
  });
});
