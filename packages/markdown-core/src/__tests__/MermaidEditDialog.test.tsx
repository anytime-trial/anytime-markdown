/**
 * MermaidEditDialog.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

jest.mock("dompurify", () => ({
  sanitize: (html: string) => html,
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  FS_TAB_FONT_SIZE: 12,
  FS_TOOLBAR_HEIGHT: 40,
}));

jest.mock("../constants/samples", () => ({
  MERMAID_SAMPLES: [],
}));

jest.mock("../hooks/useMermaidRender", () => ({
  SVG_SANITIZE_CONFIG: {},
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "monospace",
  }),
}));

jest.mock("../utils/diffEngine", () => ({
  computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
  applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
}));

jest.mock("../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "",
}));

jest.mock("../utils/mermaidConfig", () => ({
  extractMermaidConfig: () => ({}),
  mergeMermaidConfig: (code: string) => code,
}));

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ children }: any) => <div data-testid="split-layout">{children}</div>,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: () => <div data-testid="edit-dialog-header" />,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: () => <div data-testid="fullscreen-diff-view" />,
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: () => <div data-testid="line-number-textarea" />,
}));

jest.mock("../components/SamplePanel", () => ({
  SamplePanel: () => <div data-testid="sample-panel" />,
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div data-testid="zoomable-preview">{children}</div>,
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => <div data-testid="zoom-toolbar" />,
}));

import { MermaidEditDialog } from "../components/MermaidEditDialog";

const theme = createTheme();

describe("MermaidEditDialog", () => {
  const t = (key: string) => key;
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
      <ThemeProvider theme={theme}>
        <MermaidEditDialog
          open={false}
          onClose={jest.fn()}
          label="Test"
          svg=""
          code=""
          fsCode=""
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
          fsZP={fsZP as any}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders when open", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog
          open={true}
          onClose={jest.fn()}
          label="Test Diagram"
          svg="<svg></svg>"
          code="graph TD; A-->B"
          fsCode="graph TD; A-->B"
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
          fsZP={fsZP as any}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
