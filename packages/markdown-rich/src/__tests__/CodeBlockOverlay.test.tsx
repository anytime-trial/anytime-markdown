/**
 * CodeBlockOverlay の render スモーク + ツールバー dispatch テスト。
 * viewer の context/useBlockChrome は静的にモックする。
 */

let mockChrome: Record<string, unknown> = {};
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  useIsDark: () => false,
  useEditorSettingsContext: () => ({ fontSize: 16, lineHeight: 1.6 }),
  useMarkdownT: () => (k: string) => k,
  useBlockChrome: () => mockChrome,
}));

// lowlight(ESM) と重量ダイアログ部品をスタブする（CodeBlockEditDialog.test と同方針）。
jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({ highlight: (_l: string, c: string) => ({ value: c }), listLanguages: () => [] }),
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock("../components/DraggableSplitLayout", () => ({ DraggableSplitLayout: ({ children }: any) => <div>{children}</div> }));
jest.mock("../components/FullscreenDiffView", () => ({ FullscreenDiffView: () => <div /> }));
jest.mock("../components/LineNumberTextarea", () => ({ LineNumberTextarea: () => <div /> }));
jest.mock("../components/ZoomToolbar", () => ({ ZoomToolbar: () => null }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock("../components/ZoomablePreview", () => ({ ZoomablePreview: ({ children }: any) => <div>{children}</div> }));

import { render, screen } from "@testing-library/react";

import { CodeBlockOverlay } from "../components/CodeBlockOverlay";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeEditor(): any {
  const dom = document.createElement("div");
  return {
    isEditable: true,
    view: { dom },
    state: { doc: { content: { size: 100 }, nodeAt: () => null } },
    chain: () => ({
      command: (fn: (ctx: { tr: { setNodeAttribute: jest.Mock } }) => boolean) => {
        fn({ tr: { setNodeAttribute: jest.fn() } });
        return { run: jest.fn() };
      },
    }),
  };
}

const noChrome = {
  pos: -1, node: null, rect: null, updateAttrs: jest.fn(),
  deleteOpen: false, setDeleteOpen: jest.fn(), handleDelete: jest.fn(), showToolbar: false,
};

describe("CodeBlockOverlay", () => {
  it("未選択でもクラッシュせずマウントする", () => {
    mockChrome = { ...noChrome };
    const { container } = render(<CodeBlockOverlay editor={null} />);
    expect(container).toBeTruthy();
  });

  it("選択中ブロックの種別ラベルでツールバーを描画する", () => {
    mockChrome = {
      ...noChrome,
      pos: 5,
      node: { attrs: { language: "typescript" }, textContent: "x", content: { size: 1 } },
      rect: { top: 10, left: 20 } as DOMRect,
      showToolbar: true,
    };
    render(<CodeBlockOverlay editor={fakeEditor()} />);
    expect(screen.getByText("Code (typescript)")).toBeTruthy();
  });
});
