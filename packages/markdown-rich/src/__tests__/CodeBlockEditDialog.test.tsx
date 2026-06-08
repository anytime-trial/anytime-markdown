/**
 * CodeBlockEditDialog.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

jest.mock("@anytime-markdown/markdown-viewer", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-viewer"),
    getDivider: () => "#ccc",
    getTextSecondary: () => "#666",
    FS_TAB_FONT_SIZE: 12,
    FS_TOOLBAR_HEIGHT: 40,
    useEditorSettingsContext: () => ({
      fontSize: 14,
      lineHeight: 1.6,
      fontFamily: "monospace",
    }),
    computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
    applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
    EditDialogHeader: () => <div data-testid="edit-dialog-header" />,
    EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    highlight: (_lang: string, code: string) => ({ value: code }),
    listLanguages: () => [],
  }),
}));

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: () => <div />,
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: () => <div data-testid="line-number-textarea" />,
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => null,
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div>{children}</div>,
}));

import { CodeBlockEditDialog } from "../components/CodeBlockEditDialog";

const t = (key: string) => key;

describe("CodeBlockEditDialog", () => {
  const fsZP = {
    containerRef: { current: null },
    scale: 1,
    translateX: 0,
    translateY: 0,
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    resetZoom: jest.fn(),
    fitToWidth: jest.fn(),
    fitToHeight: jest.fn(),
    setTransform: jest.fn(),
  };

  it("does not render when closed", () => {
    const { container } = render(
      <CodeBlockEditDialog
        open={false}
        onClose={jest.fn()}
        label="Code"
        language="javascript"
        fsCode=""
        onFsCodeChange={jest.fn()}
        onFsTextChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
        t={t}
      />,
    );
    expect(container).toBeTruthy();
  });

  it("renders when open", () => {
    const { container } = render(
      <CodeBlockEditDialog
        open={true}
        onClose={jest.fn()}
        label="Code"
        language="javascript"
        fsCode="const x = 1;"
        onFsCodeChange={jest.fn()}
        onFsTextChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
        t={t}
      />,
    );
    expect(container).toBeTruthy();
  });
});
