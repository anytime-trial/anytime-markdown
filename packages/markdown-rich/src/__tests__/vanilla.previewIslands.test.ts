/**
 * previewIslands.ts — React island（embed / graph プレビュー）レジストリのテスト。
 * 未登録時に CodeBlockBlockContent がプレビューなしで劣化動作（throw しない）ことも検証する。
 */

import { createCodeBlockNodeView } from "../components/codeblock/CodeBlockBlockContent";
import type { EmbedMountHandle, GraphMountHandle } from "../components/codeblock/previewContracts";
import {
  getPreviewIslands,
  registerPreviewIslands,
  resetPreviewIslands,
} from "../components/codeblock/previewIslands";

afterEach(() => {
  resetPreviewIslands();
});

describe("previewIslands レジストリ", () => {
  it("register → get で同一実装を返し、reset で null に戻る", () => {
    const impl = {
      mountEmbedPreview: jest.fn(() => ({ render: jest.fn(), destroy: jest.fn() }) as unknown as EmbedMountHandle),
      mountGraphPreview: jest.fn(() => ({ render: jest.fn(), destroy: jest.fn() }) as unknown as GraphMountHandle),
    };
    expect(getPreviewIslands()).toBeNull();
    registerPreviewIslands(impl);
    expect(getPreviewIslands()).toBe(impl);
    resetPreviewIslands();
    expect(getPreviewIslands()).toBeNull();
  });

  it("未登録でも embed ブロックの NodeView 生成・描画が throw しない（劣化動作）", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = { isEditable: true, commands: { setTextSelection: jest.fn() }, chain: jest.fn() } as never;
    const node = {
      attrs: { language: "embed card", codeCollapsed: false },
      type: { name: "codeBlock" },
      textContent: "https://example.com",
    } as never;
    expect(() => {
      const view = createCodeBlockNodeView({ node, editor, getPos: () => 3 });
      view.destroy?.();
    }).not.toThrow();
    warnSpy.mockRestore();
  });
});
