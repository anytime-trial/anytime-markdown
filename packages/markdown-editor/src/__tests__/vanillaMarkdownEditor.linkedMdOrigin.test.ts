/**
 * host/vanillaMarkdownEditor.ts の linkedMd postMessage ブリッジ origin チェック
 * リグレッションテスト（指摘16: レビュー 20260702-markdown-editor-full-review.ja.md
 * セクション16）。
 *
 * 旧実装 `if (event.origin && !event.origin.startsWith(...) && ...) return;` は
 * `event.origin === ""` のとき短絡評価で条件全体が false になり検証をすり抜ける。
 * 空文字列 origin のメッセージが requestId 一致のみで受理されないことを検証する。
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

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";
import { getLinkedMdProvider } from "../linkedMdProvider";

const t = (key: string): string => key;

describe("linkedMd ブリッジの origin 検証（指摘16）", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("空文字列 origin のメッセージは requestId が一致しても受理しない", async () => {
    const postMessage = jest.fn();
    const vscodeApi: VsCodeApi = {
      postMessage,
      getState: () => undefined,
      setState: () => {},
    };
    const handle = mountVanillaMarkdownEditor(container, { t, vscodeApi });

    const provider = getLinkedMdProvider();
    expect(provider).not.toBeNull();

    let resolved = false;
    let rejected = false;
    provider!
      .fetch("./linked.md")
      .then(() => {
        resolved = true;
      })
      .catch(() => {
        rejected = true;
      });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = postMessage.mock.calls[0][0] as { requestId: string };
    const requestId = sent.requestId;

    // 攻撃者が空文字列 origin（file:// 等の iframe/内部フレーム由来）から偽装した応答を送る。
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "",
        data: {
          type: "linkedMdContent",
          requestId,
          content: "FORGED CONTENT",
          resolvedPath: "./linked.md",
          token: { mtimeMs: 0, size: 0 },
        },
      }),
    );

    // マイクロタスクを数ターン進めても解決されない（拒否によりリクエストは pending のまま）。
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    handle.destroy();
  });
});
