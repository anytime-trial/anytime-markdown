import { test, expect } from "@playwright/test";

const MARKDOWN_WITH_HEADINGS = `# First Heading

Some text under first heading

## Second Heading

More text here

## Third Heading

End text`;

test.describe("Outline", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/markdown");
    await page.locator(".tiptap").waitFor({ state: "visible" });

    // ソースモードに切替えて見出し付きコンテンツを入力
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill(MARKDOWN_WITH_HEADINGS);

    // 編集モードに戻す
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".tiptap")).toBeVisible();
    // Tooltip がボタンを遮蔽しないよう、エディタ領域にマウスを移動
    await page.locator(".tiptap").hover();
  });

  test("outline panel shows headings", async ({ page }) => {
    // アウトラインパネルを開く
    await page.getByRole("button", { name: "Outline" }).click();

    // アウトラインナビゲーション領域が表示される
    const outlineNav = page.getByRole("navigation", { name: "Heading navigation" });
    await expect(outlineNav).toBeVisible();

    // 各見出しがアウトラインパネル内に表示される（exact で他のボタンとの曖昧一致を回避）
    await expect(outlineNav.getByRole("button", { name: "First Heading", exact: true })).toBeVisible();
    await expect(outlineNav.getByRole("button", { name: "Second Heading", exact: true })).toBeVisible();
    await expect(outlineNav.getByRole("button", { name: "Third Heading", exact: true })).toBeVisible();
  });

  test("clicking heading scrolls to position", async ({ page }) => {
    // アウトラインパネルを開く
    await page.getByRole("button", { name: "Outline" }).click();

    const outlineNav = page.getByRole("navigation", { name: "Heading navigation" });
    await expect(outlineNav).toBeVisible();
    // Tooltip を消すためにパネル内にマウスを移動
    await outlineNav.hover();

    // アウトライン内の Third Heading をクリック（exact で一意に特定）
    await outlineNav.getByRole("button", { name: "Third Heading", exact: true }).click({ force: true });

    // エディタ内の対応する見出し要素がビューポート内にあることを確認
    const headingInEditor = page.locator(".tiptap h2", { hasText: "Third Heading" });
    await expect(headingInEditor).toBeInViewport();
  });

  test("fold all / unfold all works", async ({ page }) => {
    // アウトラインパネルを開く
    await page.getByRole("button", { name: "Outline" }).click();

    const outlineNav = page.getByRole("navigation", { name: "Heading navigation" });
    await expect(outlineNav).toBeVisible();
    // Tooltip を消すためにパネル内にマウスを移動
    await outlineNav.hover();

    // Fold All ボタンをクリック（Tooltip が覆う場合があるため force）
    await outlineNav.getByRole("button", { name: "Fold All" }).click({ force: true });

    // heading-folded クラスがエディタ内に出現する（Firefoxではタイミングが遅い場合がある）
    const foldedHeadings = page.locator(".tiptap .heading-folded");
    await expect(foldedHeadings.first()).toBeAttached({ timeout: 10000 });

    // ボタンが Unfold All に変わっているのでクリック
    await outlineNav.getByRole("button", { name: "Unfold All" }).click({ force: true });

    // heading-folded クラスがなくなる
    await expect(page.locator(".tiptap .heading-folded")).toHaveCount(0);
  });
});
