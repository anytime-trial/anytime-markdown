/**
 * ロック付き文書のマウント初期化リグレッションテスト（S4 受入で顕在化した web-app 実障害）。
 *
 * installChrome 実行中に refreshSectionLocks が transaction を dispatch すると、
 * 'transaction' 購読（コメント dirty 追跡）が初期化前の chrome（statusBar 等・TDZ）へ
 * カスケードし `Cannot access 'statusBar' before initialization` で mount が壊れる。
 * 初期状態は dispatch せず registerPlugin の state.init で装飾を構築すること。
 *
 * モック構成は AnytimeMarkdownEditorElement.test.ts と同一（lowlight ESM / raw .md /
 * @floating-ui/dom）。
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

import "../element";
import type { AnytimeMarkdownEditorElement } from "../AnytimeMarkdownEditorElement";

const LOCKED_DOC = [
  "---",
  "lockedSections:",
  '    - path: "T > 設計"',
  "      occurrence: 1",
  '      hash: "fnv1a64:0000000000000000"',
  '      lockedAt: "2026-07-17T03:00:00.000Z"',
  '      lockedBy: "human"',
  "---",
  "",
  "# T",
  "",
  "## 設計",
  "",
  "本文。",
  "",
].join("\n");

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--am-color-bg-paper");
});

it("lockedSections を含む文書を初期値にしても mount が throw しない", () => {
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent): void => {
    errors.push(e.error);
  };
  window.addEventListener("error", onError);
  try {
    const el = document.createElement("anytime-markdown-editor") as AnytimeMarkdownEditorElement;
    el.value = LOCKED_DOC;
    expect(() => document.body.appendChild(el)).not.toThrow();
    expect(errors).toEqual([]);
    expect(el.querySelector("[data-am-editor-root]")).not.toBeNull();
    el.remove();
  } finally {
    window.removeEventListener("error", onError);
  }
});
