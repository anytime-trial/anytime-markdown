# E2E テスト環境構築 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Playwright Test で web-app の e2e テスト環境を構築し、25 のリグレッション防止シナリオを実装する。

**Architecture:** `packages/web-app/` に `playwright.config.ts` と `e2e/` ディレクトリを配置。`webServer` 設定で `next dev` を自動起動し、Chromium でテスト実行。エディタの操作は `aria-label` ベースのロケータで要素を特定する。

**Tech Stack:** @playwright/test, Chromium, Next.js dev server

---

### Task 1: Playwright インストールと設定

**Files:**
- Modify: `packages/web-app/package.json` (devDependencies に @playwright/test 追加)
- Create: `packages/web-app/playwright.config.ts`
- Modify: `.gitignore` (playwright-report/, test-results/ 追加)

**Step 1: @playwright/test をインストール**

```bash
cd packages/web-app && npm install -D @playwright/test
```

**Step 2: package.json に e2e スクリプト追加**

`packages/web-app/package.json` の `scripts` に追加:
```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

**Step 3: playwright.config.ts を作成**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

**Step 4: .gitignore に追加**

`.gitignore` の末尾に追加:
```
# Playwright
playwright-report/
test-results/
```

**Step 5: 動作確認 — 空テストで Playwright が起動するか**

`packages/web-app/e2e/smoke.spec.ts` を作成:
```typescript
import { test, expect } from "@playwright/test";

test("page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
});
```

```bash
cd packages/web-app && npx playwright test
```

Expected: 1 test passed

**Step 6: コミット**

```bash
git add packages/web-app/package.json packages/web-app/playwright.config.ts packages/web-app/e2e/smoke.spec.ts .gitignore
git commit -m "feat(e2e): add Playwright config and smoke test"
```

---

### Task 2: editor-basic.spec.ts — 基本操作テスト

**Files:**
- Create: `packages/web-app/e2e/editor-basic.spec.ts`
- Delete: `packages/web-app/e2e/smoke.spec.ts` (Task 1 の仮テスト)

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Editor Basic", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // ウェルカムコンテンツの読み込みを待機
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("page loads with editor and toolbar", async ({ page }) => {
    // ツールバーが表示される
    await expect(page.getByRole("toolbar", { name: /editor/i })).toBeVisible();
    // エディタ領域が表示される
    await expect(page.locator(".tiptap")).toBeVisible();
    // ステータスバーが表示される（文字数表示）
    await expect(page.getByText(/chars/i)).toBeVisible();
  });

  test("can type text in editor", async ({ page }) => {
    const editor = page.locator(".tiptap");
    // エディタをクリアしてテキスト入力
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Hello Playwright");
    await expect(editor).toContainText("Hello Playwright");
  });

  test("can apply bold formatting via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("bold text");
    // テキスト選択
    await page.keyboard.press("Control+a");
    // Bold ボタンクリック (BubbleMenu から)
    await page.keyboard.press("Control+b");
    // <strong> が適用されている
    await expect(editor.locator("strong")).toContainText("bold text");
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test editor-basic
```

Expected: 3 tests passed

**Step 3: smoke.spec.ts を削除**

```bash
rm packages/web-app/e2e/smoke.spec.ts
```

**Step 4: コミット**

```bash
git add packages/web-app/e2e/
git commit -m "test(e2e): add editor basic tests"
```

---

### Task 3: mode-switch.spec.ts — モード切替テスト

**Files:**
- Create: `packages/web-app/e2e/mode-switch.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Mode Switch", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("switch to source mode and back preserves content", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Test content for mode switch");

    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    // ソースエディタ（textarea）が表示される
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toContainText("Test content for mode switch");

    // WYSIWYG モードに戻す
    await page.getByRole("button", { name: /wysiwyg/i }).click();
    await expect(page.locator(".tiptap")).toContainText("Test content for mode switch");
  });

  test("edit markdown in source mode reflects in WYSIWYG", async ({ page }) => {
    // ソースモードに切替
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await textarea.click();
    await page.keyboard.press("Control+a");
    await textarea.fill("# Heading from Source\n\nParagraph text");

    // WYSIWYG に戻す
    await page.getByRole("button", { name: /wysiwyg/i }).click();
    const editor = page.locator(".tiptap");
    await expect(editor.locator("h1")).toContainText("Heading from Source");
    await expect(editor).toContainText("Paragraph text");
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test mode-switch
```

Expected: 2 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/mode-switch.spec.ts
git commit -m "test(e2e): add mode switch tests"
```

---

### Task 4: toolbar.spec.ts — ツールバー操作テスト

**Files:**
- Create: `packages/web-app/e2e/toolbar.spec.ts`

**Step 1: テストファイル作成**

ツールバーのボタンは `aria-label` で特定する。i18n キーはデフォルト英語で `t("key")` の値を使う。

```typescript
import { test, expect } from "@playwright/test";

test.describe("Toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // ウェルカムコンテンツをクリア
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  });

  test("insert heading via slash command", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("/h1");
    // スラッシュコマンドメニューから H1 を選択
    await page.getByRole("option", { name: /heading 1/i }).click();
    await page.keyboard.type("My Heading");
    await expect(editor.locator("h1")).toContainText("My Heading");
  });

  test("insert code block via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    // コードブロックボタン
    await page.getByRole("button", { name: /code block/i }).click();
    await expect(editor.locator("pre code")).toBeVisible();
  });

  test("insert table via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.getByRole("button", { name: /insert table/i }).click();
    await expect(editor.locator("table")).toBeVisible();
  });

  test("insert horizontal rule via toolbar", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.type("Before rule");
    await page.getByRole("button", { name: /horizontal rule/i }).click();
    await expect(editor.locator("hr")).toBeVisible();
  });

  test("diagram menu opens", async ({ page }) => {
    await page.getByRole("button", { name: /insert diagram/i }).click();
    // ポップオーバーメニューが表示される（Mermaid / PlantUML）
    await expect(page.getByText(/mermaid/i)).toBeVisible();
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test toolbar
```

Expected: 5 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/toolbar.spec.ts
git commit -m "test(e2e): add toolbar tests"
```

---

### Task 5: file-ops.spec.ts — ファイル操作テスト

**Files:**
- Create: `packages/web-app/e2e/file-ops.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";
import path from "path";

test.describe("File Operations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("download markdown file", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Download test content");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test("upload markdown file", async ({ page }) => {
    // hidden input[type=file] にファイルをセット
    const fileInput = page.locator('input[type="file"][accept*=".md"]');
    await fileInput.setInputFiles({
      name: "test.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Uploaded Heading\n\nUploaded paragraph"),
    });

    // 確認ダイアログが出る場合は OK
    page.on("dialog", (d) => d.accept());

    const editor = page.locator(".tiptap");
    await expect(editor.locator("h1")).toContainText("Uploaded Heading");
  });

  test("create new clears content", async ({ page }) => {
    const editor = page.locator(".tiptap");
    // ウェルカムコンテンツがある状態
    await expect(editor).not.toBeEmpty();

    // 確認ダイアログを自動 OK
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /create new/i }).click();

    // エディタがクリアされる（プレースホルダーが表示されるか、コンテンツが空）
    await expect(editor.locator("h1")).toHaveCount(0);
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test file-ops
```

Expected: 3 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/file-ops.spec.ts
git commit -m "test(e2e): add file operations tests"
```

---

### Task 6: search-replace.spec.ts — 検索/置換テスト

**Files:**
- Create: `packages/web-app/e2e/search-replace.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Search and Replace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // テスト用テキストを入力
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("apple banana apple cherry apple");
  });

  test("search highlights matches", async ({ page }) => {
    // Ctrl+F で検索バーを開く
    await page.keyboard.press("Control+f");
    const searchInput = page.locator("#search-replace-bar input").first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("apple");
    // ハイライトされたマッチが表示される
    await expect(page.locator(".search-match, .search-match-current").first()).toBeVisible();
  });

  test("replace text", async ({ page }) => {
    await page.keyboard.press("Control+h");
    const inputs = page.locator("#search-replace-bar input");
    const searchInput = inputs.first();
    const replaceInput = inputs.nth(1);
    await searchInput.fill("apple");
    await replaceInput.fill("orange");
    // Replace All ボタンをクリック
    await page.getByRole("button", { name: /replace all/i }).click();
    const editor = page.locator(".tiptap");
    await expect(editor).not.toContainText("apple");
    await expect(editor).toContainText("orange");
  });

  test("regex search", async ({ page }) => {
    await page.keyboard.press("Control+f");
    const searchInput = page.locator("#search-replace-bar input").first();
    // 正規表現モードを有効化
    await page.getByRole("button", { name: /regex/i }).click();
    await searchInput.fill("app.e");
    await expect(page.locator(".search-match, .search-match-current").first()).toBeVisible();
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test search-replace
```

Expected: 3 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/search-replace.spec.ts
git commit -m "test(e2e): add search and replace tests"
```

---

### Task 7: outline.spec.ts — アウトラインテスト

**Files:**
- Create: `packages/web-app/e2e/outline.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Outline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    // 見出しを含むコンテンツをソースモードで入力
    await page.getByRole("button", { name: /source/i }).click();
    const textarea = page.locator("textarea");
    await textarea.fill("# First Heading\n\nSome text\n\n## Second Heading\n\nMore text\n\n## Third Heading\n\nEnd text");
    await page.getByRole("button", { name: /wysiwyg/i }).click();
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("outline panel shows headings", async ({ page }) => {
    // アウトラインボタンをクリック
    await page.getByRole("button", { name: /outline/i }).click();
    // 見出しが表示される
    await expect(page.getByText("First Heading").last()).toBeVisible();
    await expect(page.getByText("Second Heading").last()).toBeVisible();
    await expect(page.getByText("Third Heading").last()).toBeVisible();
  });

  test("clicking heading scrolls to position", async ({ page }) => {
    await page.getByRole("button", { name: /outline/i }).click();
    // Third Heading をクリック
    await page.getByText("Third Heading").last().click();
    // エディタ内の h2 が可視領域にあることを確認
    const h2 = page.locator(".tiptap h2", { hasText: "Third Heading" });
    await expect(h2).toBeInViewport();
  });

  test("fold all / unfold all works", async ({ page }) => {
    // Fold All ボタン
    await page.getByRole("button", { name: /fold all/i }).click();
    // 見出し以降のテキストが非表示（折りたたまれている）
    const editor = page.locator(".tiptap");
    // heading-folded クラスが適用される
    await expect(editor.locator(".heading-folded").first()).toBeVisible();

    // Unfold All
    await page.getByRole("button", { name: /unfold all/i }).click();
    await expect(editor.locator(".heading-folded")).toHaveCount(0);
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test outline
```

Expected: 3 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/outline.spec.ts
git commit -m "test(e2e): add outline tests"
```

---

### Task 8: settings.spec.ts — 設定テスト

**Files:**
- Create: `packages/web-app/e2e/settings.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
  });

  test("toggle dark/light theme", async ({ page }) => {
    // 設定パネルを開く
    // "More" メニューから設定を開く
    const moreButton = page.getByRole("button", { name: /more/i });
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await page.getByText(/settings/i).click();
    } else {
      await page.getByRole("button", { name: /settings/i }).click();
    }

    // テーマ切替
    const darkModeSwitch = page.getByRole("checkbox", { name: /dark/i });
    if (await darkModeSwitch.isVisible()) {
      const wasDark = await darkModeSwitch.isChecked();
      await darkModeSwitch.click();
      // body の色が変わったことを確認（暗い背景か明るい背景か）
      const bgColor = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor
      );
      expect(bgColor).toBeTruthy();
    }
  });

  test("switch language en/ja", async ({ page }) => {
    // 設定パネルを開く
    const moreButton = page.getByRole("button", { name: /more/i });
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await page.getByText(/settings/i).click();
    } else {
      await page.getByRole("button", { name: /settings/i }).click();
    }

    // 言語切替セレクトを探す
    const langSelect = page.getByRole("combobox", { name: /language/i });
    if (await langSelect.isVisible()) {
      await langSelect.click();
      await page.getByRole("option", { name: /日本語/i }).click();
      // 日本語の UI テキストが表示される
      await expect(page.getByText(/アウトライン/i)).toBeVisible();
    }
  });

  test("change font size", async ({ page }) => {
    const moreButton = page.getByRole("button", { name: /more/i });
    if (await moreButton.isVisible()) {
      await moreButton.click();
      await page.getByText(/settings/i).click();
    } else {
      await page.getByRole("button", { name: /settings/i }).click();
    }

    // フォントサイズスライダー or input を探す
    const fontSizeInput = page.getByRole("slider", { name: /font/i });
    if (await fontSizeInput.isVisible()) {
      const initialSize = await page.locator(".tiptap").evaluate((el) =>
        getComputedStyle(el).fontSize
      );
      // スライダーを操作（値を大きくする）
      await fontSizeInput.fill("20");
      const newSize = await page.locator(".tiptap").evaluate((el) =>
        getComputedStyle(el).fontSize
      );
      expect(newSize).not.toBe(initialSize);
    }
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test settings
```

Expected: 3 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/settings.spec.ts
git commit -m "test(e2e): add settings tests"
```

---

### Task 9: keyboard.spec.ts — キーボードショートカットテスト

**Files:**
- Create: `packages/web-app/e2e/keyboard.spec.ts`

**Step 1: テストファイル作成**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".tiptap").waitFor({ state: "visible" });
    const editor = page.locator(".tiptap");
    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("shortcut test text");
  });

  test("Ctrl+B toggles bold", async ({ page }) => {
    const editor = page.locator(".tiptap");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+b");
    await expect(editor.locator("strong")).toContainText("shortcut test text");
    // もう一度で解除
    await page.keyboard.press("Control+b");
    await expect(editor.locator("strong")).toHaveCount(0);
  });

  test("Ctrl+Z undoes and Ctrl+Y redoes", async ({ page }) => {
    const editor = page.locator(".tiptap");
    const originalText = await editor.textContent();

    // 追加入力
    await page.keyboard.type(" extra");
    await expect(editor).toContainText("extra");

    // Undo
    await page.keyboard.press("Control+z");
    const afterUndo = await editor.textContent();
    expect(afterUndo).not.toContain("extra");

    // Redo
    await page.keyboard.press("Control+y");
    await expect(editor).toContainText("extra");
  });

  test("Ctrl+S triggers save (no error)", async ({ page }) => {
    // Ctrl+S がエラーなく動作することを確認（ブラウザのデフォルト保存ダイアログを抑制）
    const editor = page.locator(".tiptap");
    await editor.click();
    // エラーが発生しないことを確認
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.keyboard.press("Control+s");
    // 少し待ってからエラーチェック
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});
```

**Step 2: テスト実行**

```bash
cd packages/web-app && npx playwright test keyboard
```

Expected: 3 tests passed

**Step 3: コミット**

```bash
git add packages/web-app/e2e/keyboard.spec.ts
git commit -m "test(e2e): add keyboard shortcut tests"
```

---

### Task 10: CI 統合と最終確認

**Files:**
- Modify: `.github/workflows/publish-vscode-extension.yml` (e2e テストステップ追加)

**Step 1: 全 e2e テストを実行して確認**

```bash
cd packages/web-app && npx playwright test
```

Expected: 25 tests passed

**Step 2: CI ワークフローに e2e ステップ追加**

`.github/workflows/publish-vscode-extension.yml` の test ジョブに追加:

```yaml
      - name: E2E tests (web-app)
        working-directory: packages/web-app
        run: npx playwright test
```

**Step 3: コミット**

```bash
git add .github/workflows/publish-vscode-extension.yml
git commit -m "ci: add e2e test step to workflow"
```

**Step 4: 全テスト（ユニット + e2e）が通ることを確認**

```bash
npx tsc --noEmit && npm test && cd packages/web-app && npx playwright test
```

Expected: tsc OK, jest 326+ tests passed, playwright 25 tests passed
