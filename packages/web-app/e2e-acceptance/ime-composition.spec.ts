import { expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 受入ファーム S2: IME 変換中操作の合成 composition シナリオ（要件書 §6）。
 *
 * CDP `Input.imeSetComposition` / `Input.insertText` で「変換中」を合成する。
 * 合成イベントは実 IME の完全代替ではない（変換候補 UI・IME 側の確定キー処理は再現不能）ため、
 * 実 IME での確認は人手受入に残る。ここで固定するのは実測済みの決定論的な不変条件:
 * - 変換中テキストは本文に見え、確定（insertText）で確定テキストが 1 回だけ入る
 * - 変換キャンセル + Escape で既存本文が破壊されない
 * - 変換中の Enter で段落が分割されない（ProseMirror が composition 中の Enter を抑止）
 * - 変換中の矢印キーでノード分裂やシリアライズ破壊が起きない
 */

const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "../../markdown-viewer/e2e-harness/index.html"),
).href;

const FIXTURE = "# 見出し\n\n本文段落です。\n";

declare global {
  interface Window {
    __harnessReady?: boolean;
    __harness?: { setValue(md: string): void; getValue(): string };
  }
}

async function openWithFixture(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(`${HARNESS_URL}?theme=light`);
  await page.waitForFunction(() => window.__harnessReady === true);
  await page.evaluate((md) => window.__harness?.setValue(md), FIXTURE);
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.press("ControlOrMeta+End");
}

function getValue(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => window.__harness?.getValue() ?? "");
}

test("変換中テキストが本文に反映され、確定で確定テキストが 1 回だけ入る", async ({ page }) => {
  await openWithFixture(page);
  const client = await page.context().newCDPSession(page);

  await client.send("Input.imeSetComposition", { text: "へんかん", selectionStart: 4, selectionEnd: 4 });
  expect(await getValue(page)).toBe("# 見出し\n\n本文段落です。へんかん\n");

  await client.send("Input.insertText", { text: "変換確定" });
  const committed = await getValue(page);
  expect(committed).toBe("# 見出し\n\n本文段落です。変換確定\n");
  expect(committed.split("変換確定").length - 1).toBe(1);
});

test("変換キャンセル + Escape で既存本文が破壊されない", async ({ page }) => {
  await openWithFixture(page);
  const client = await page.context().newCDPSession(page);

  await client.send("Input.imeSetComposition", { text: "へんかん", selectionStart: 4, selectionEnd: 4 });
  await client.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
  await page.keyboard.press("Escape");

  expect(await getValue(page)).toBe(FIXTURE);
});

test("変換中の Enter で段落が分割されず、確定テキストが 1 回だけ入る", async ({ page }) => {
  await openWithFixture(page);
  const client = await page.context().newCDPSession(page);

  await client.send("Input.imeSetComposition", { text: "かくてい", selectionStart: 4, selectionEnd: 4 });
  await page.keyboard.press("Enter");
  // Enter が段落を割っていないこと（composition テキストは同一段落末尾のまま）
  expect(await getValue(page)).toBe("# 見出し\n\n本文段落です。かくてい\n");

  await client.send("Input.insertText", { text: "確定" });
  expect(await getValue(page)).toBe("# 見出し\n\n本文段落です。確定\n");
});

test("変換中の矢印キーでノード分裂・本文破壊が起きない", async ({ page }) => {
  await openWithFixture(page);
  const client = await page.context().newCDPSession(page);

  await client.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
  await page.keyboard.press("ArrowLeft");
  await client.send("Input.insertText", { text: "あ" });

  expect(await getValue(page)).toBe("# 見出し\n\n本文段落です。あ\n");
});
