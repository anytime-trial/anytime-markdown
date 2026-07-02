/**
 * host/vanillaMarkdownEditor.ts の webImport create 分岐サニタイズ適用リグレッションテスト
 * （指摘14: レビュー 20260702-markdown-editor-full-review.ja.md セクション14）。
 *
 * `handleWebImportSubmit` は insert 分岐のみ `insertMarkdownAtCursor`（内部で sanitizeMarkdown）
 * を経由し、create 分岐は `composeNewDocument` の出力を未サニタイズのまま `onWebImportCreate` へ
 * 渡していた。create 経路でも sanitizeMarkdown を通ることを検証する。
 */
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

// create 分岐が sanitizeMarkdown を通ったことを識別可能にするため、既定実装をマーカー付与に置換。
jest.mock("../utils/sanitizeMarkdown", () => ({
  ...jest.requireActual("../utils/sanitizeMarkdown"),
  sanitizeMarkdown: jest.fn((md: string) => `SANITIZED:${md}`),
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";
import { setWebImportProvider } from "../webImport/webImportProvider";
import { sanitizeMarkdown } from "../utils/sanitizeMarkdown";

const t = (key: string): string => key;

function submitViaEnter(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

describe("webImport create 分岐のサニタイズ適用（指摘14）", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren(...Array.from(document.body.children).filter((c) => c === container));
    setWebImportProvider(null);
    jest.clearAllMocks();
  });

  it("create 分岐でも sanitizeMarkdown を通してから onWebImportCreate へ渡す", async () => {
    setWebImportProvider({
      fetch: async () => ({
        html: "<html><head><title>Imported</title></head><body><article><h1>Imported</h1><p>Body text.</p></article></body></html>",
        finalUrl: "https://example.com/imported",
      }),
    });

    const onWebImportCreate = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      fileHandlers: { onWebImportCreate },
    });

    const importBtn = container.querySelector<HTMLButtonElement>('button[aria-label="slashWebImport"]');
    expect(importBtn).toBeTruthy();
    importBtn?.click();

    const input = document.querySelector<HTMLInputElement>('[data-am-tf-root] input');
    expect(input).toBeTruthy();
    submitViaEnter(input!, "https://example.com/imported");

    // fetch + compose + sanitize は非同期。マイクロタスクを複数ターン進める。
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sanitizeMarkdown).toHaveBeenCalled();
    expect(onWebImportCreate).toHaveBeenCalledTimes(1);
    const [markdown] = onWebImportCreate.mock.calls[0] as [string, string];
    expect(markdown.startsWith("SANITIZED:")).toBe(true);

    handle.destroy();
  });
});
