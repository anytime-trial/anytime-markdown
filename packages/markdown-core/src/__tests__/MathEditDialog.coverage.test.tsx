/**
 * MathEditDialog.tsx - カバレッジテスト (lines 46-97)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock all complex dependencies
jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  FS_TOOLBAR_HEIGHT: 32,
  MENU_ITEM_FONT_SIZE: "0.8rem",
}));

jest.mock("../constants/samples", () => ({
  MATH_SAMPLES: [
    { label: "Sample", i18nKey: "sampleKey", code: "E=mc^2", enabled: true },
  ],
}));

jest.mock("../hooks/useKatexRender", () => ({
  useKatexRender: ({ code }: { code: string }) => ({
    html: code ? `<span>${code}</span>` : "",
    error: "",
  }),
  MATH_SANITIZE_CONFIG: {},
}));

jest.mock("../hooks/useZoomPan", () => ({
  useZoomPan: () => ({
    scale: 1,
    translate: { x: 0, y: 0 },
    containerRef: { current: null },
    handlePointerDown: jest.fn(),
    handlePointerMove: jest.fn(),
    handlePointerUp: jest.fn(),
    handleWheel: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    resetZoom: jest.fn(),
    fitToView: jest.fn(),
  }),
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
  }),
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ left, right }: any) => <div>{left}{right}</div>,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ label }: any) => <div data-testid="header">{label}</div>,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="wrapper">{children}</div> : null,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: () => <div data-testid="diff-view" />,
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: ({ value, onChange }: any) => (
    <textarea data-testid="code-textarea" value={value} onChange={onChange} />
  ),
}));

jest.mock("../components/SamplePanel", () => ({
  SamplePanel: () => <div data-testid="sample-panel" />,
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div data-testid="preview">{children}</div>,
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => <div data-testid="zoom-toolbar" />,
}));

import { MathEditDialog } from "../components/MathEditDialog";

const theme = createTheme();
const t = (key: string) => key;

describe("MathEditDialog coverage", () => {
  it("renders normal view with code and preview", () => {
    render(
      <ThemeProvider theme={theme}>
        <MathEditDialog
          open={true}
          onClose={jest.fn()}
          label="Math"
          fsCode="E=mc^2"
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{} as any}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("wrapper")).toBeTruthy();
    expect(screen.getByTestId("code-textarea")).toBeTruthy();
    expect(screen.getByTestId("preview")).toBeTruthy();
  });

  it("renders compare view when isCompareMode and compareCode provided", () => {
    render(
      <ThemeProvider theme={theme}>
        <MathEditDialog
          open={true}
          onClose={jest.fn()}
          label="Math"
          fsCode="E=mc^2"
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{} as any}
          isCompareMode
          compareCode="a^2+b^2=c^2"
          thisCode="E=mc^2"
          t={t}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("diff-view")).toBeTruthy();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MathEditDialog
          open={false}
          onClose={jest.fn()}
          label="Math"
          fsCode=""
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{} as any}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("wrapper")).toBeNull();
  });

  it("renders with readOnly mode", () => {
    render(
      <ThemeProvider theme={theme}>
        <MathEditDialog
          open={true}
          onClose={jest.fn()}
          label="Math"
          fsCode="x^2"
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{} as any}
          readOnly
          t={t}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("wrapper")).toBeTruthy();
  });

  it("renders with math error", () => {
    // Override mock to return error
    jest.spyOn(require("../hooks/useKatexRender"), "useKatexRender").mockReturnValue({
      html: "",
      error: "Parse error",
    });

    render(
      <ThemeProvider theme={theme}>
        <MathEditDialog
          open={true}
          onClose={jest.fn()}
          label="Math"
          fsCode="\\invalid"
          onFsCodeChange={jest.fn()}
          onFsTextChange={jest.fn()}
          fsTextareaRef={{ current: null }}
          fsSearch={{} as any}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText("Parse error")).toBeTruthy();
  });
});
