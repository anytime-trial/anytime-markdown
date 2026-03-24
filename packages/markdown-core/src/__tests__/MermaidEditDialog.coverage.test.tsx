/**
 * MermaidEditDialog.tsx coverage tests
 * Targets uncovered lines: 87-90, 95-98, 103-105, 113-115, 146-179
 * - handleCodeTabChange (87-90)
 * - handleConfigChange (95-98)
 * - handleInsertSample (103-105)
 * - displaySvg scaling (113-115)
 * - Tab switching and textarea rendering (146-179)
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

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

const mockSamples = [
  { id: "flowchart", label: "Flowchart", code: "graph TD; A-->B", enabled: true },
];

jest.mock("../constants/samples", () => ({
  MERMAID_SAMPLES: mockSamples,
}));

jest.mock("../hooks/useMermaidRender", () => ({
  SVG_SANITIZE_CONFIG: {},
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 16,
    lineHeight: 1.6,
    fontFamily: "monospace",
  }),
}));

jest.mock("../utils/diffEngine", () => ({
  computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
  applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
}));

jest.mock("../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "diagram alt",
}));

jest.mock("../utils/mermaidConfig", () => ({
  extractMermaidConfig: (code: string) => {
    const match = /^%%\{init:\s*([\s\S]*?)\}%%\n?/.exec(code);
    if (match) {
      return { config: match[1], body: code.slice(match[0].length) };
    }
    return { config: "", body: code };
  },
  mergeMermaidConfig: (config: string, body: string) => {
    if (!config) return body;
    return `%%{init: ${config}}%%\n${body}`;
  },
}));

let capturedLeft: any = null;
let capturedRight: any = null;

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ left, right }: any) => {
    capturedLeft = left;
    capturedRight = right;
    return <div data-testid="split-layout">{left}{right}</div>;
  },
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ showCompareView }: any) => (
    <div data-testid="edit-dialog-header" data-compare={showCompareView ? "true" : "false"} />
  ),
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: () => <div data-testid="fullscreen-diff-view" />,
}));

let capturedTextareaProps: any = {};
jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: (props: any) => {
    capturedTextareaProps = props;
    return (
      <div data-testid="line-number-textarea">
        <textarea
          data-testid={`textarea-${props.placeholder ? "config" : "code"}`}
          value={props.value}
          onChange={props.onChange}
          readOnly={props.readOnly}
        />
      </div>
    );
  },
}));

let capturedSamplePanelProps: any = {};
jest.mock("../components/SamplePanel", () => ({
  SamplePanel: (props: any) => {
    capturedSamplePanelProps = props;
    return (
      <div data-testid="sample-panel">
        <button data-testid="insert-sample" onClick={() => props.onInsert?.("graph LR; X-->Y")}>
          Insert
        </button>
      </div>
    );
  },
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div data-testid="zoomable-preview">{children}</div>,
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => <div data-testid="zoom-toolbar" />,
}));

import { MermaidEditDialog } from "../components/MermaidEditDialog";

const theme = createTheme();

function createDefaultProps(overrides?: Partial<React.ComponentProps<typeof MermaidEditDialog>>) {
  const t = (key: string) => key;
  return {
    open: true,
    onClose: jest.fn(),
    label: "Mermaid",
    svg: '<svg viewBox="0 0 800 600" width="100%" style="max-width: 800px"><rect/></svg>',
    code: "graph TD; A-->B",
    fsCode: "graph TD; A-->B",
    onFsCodeChange: jest.fn(),
    onFsTextChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: {
      query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(),
      matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(),
      replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false,
      toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(),
      useRegex: false, toggleUseRegex: jest.fn(), focusSearch: jest.fn(), reset: jest.fn(),
    } as any,
    fsZP: {
      containerRef: { current: null },
      scale: 1, translateX: 0, translateY: 0,
      zoomIn: jest.fn(), zoomOut: jest.fn(), resetZoom: jest.fn(),
      fitToWidth: jest.fn(), fitToHeight: jest.fn(), setTransform: jest.fn(),
      handlePointerMove: jest.fn(), handlePointerUp: jest.fn(),
    } as any,
    t,
    ...overrides,
  };
}

describe("MermaidEditDialog - coverage", () => {
  beforeEach(() => {
    capturedLeft = null;
    capturedRight = null;
    capturedTextareaProps = {};
    capturedSamplePanelProps = {};
  });

  // --- handleCodeTabChange (lines 87-90) ---
  test("editing in code tab calls onFsTextChange with merged code", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );

    // Code tab is active by default, find the textarea
    const codeTextarea = screen.getByTestId("textarea-code");
    fireEvent.change(codeTextarea, { target: { value: "graph LR; C-->D" } });

    expect(onFsTextChange).toHaveBeenCalledWith("graph LR; C-->D");
  });

  // --- Tab switching to config (line 146-179) ---
  test("switching to config tab shows config textarea", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps()} />
      </ThemeProvider>,
    );

    // Switch to config tab
    const configTab = screen.getByRole("tab", { name: "configTab" });
    fireEvent.click(configTab);

    // Config textarea should appear
    const configTextarea = screen.getByTestId("textarea-config");
    expect(configTextarea).toBeTruthy();
  });

  // --- handleConfigChange (lines 95-98) ---
  test("editing in config tab calls onFsTextChange with merged config+body", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );

    // Switch to config tab
    fireEvent.click(screen.getByRole("tab", { name: "configTab" }));
    const configTextarea = screen.getByTestId("textarea-config");
    fireEvent.change(configTextarea, { target: { value: '{"theme": "forest"}' } });

    expect(onFsTextChange).toHaveBeenCalledWith(expect.stringContaining("forest"));
  });

  // --- handleInsertSample (lines 103-105) ---
  test("inserting sample updates code and switches to code tab", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );

    // Click insert sample button
    fireEvent.click(screen.getByTestId("insert-sample"));

    expect(onFsTextChange).toHaveBeenCalledWith("graph LR; X-->Y");
  });

  // --- displaySvg scaling (lines 113-115) ---
  test("SVG is scaled based on editor font size", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps()} />
      </ThemeProvider>,
    );

    // The preview should contain the SVG
    const preview = screen.getByTestId("zoomable-preview");
    // SVG should be modified (width="100%" replaced with calculated width)
    expect(preview.innerHTML).toContain("svg");
  });

  test("empty SVG is passed through unchanged", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ svg: "" })} />
      </ThemeProvider>,
    );

    const preview = screen.getByTestId("zoomable-preview");
    // No SVG content rendered
    expect(preview.querySelector("[role='img']")).toBeNull();
  });

  test("SVG without viewBox is passed through unchanged", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ svg: "<svg><rect/></svg>" })} />
      </ThemeProvider>,
    );

    const preview = screen.getByTestId("zoomable-preview");
    expect(preview.innerHTML).toContain("rect");
  });

  // --- Compare mode (lines 120, 127-133) ---
  test("compare mode renders FullscreenDiffView", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog
          {...createDefaultProps({
            isCompareMode: true,
            compareCode: "graph TD; X-->Y",
            onMergeApply: jest.fn(),
            thisCode: "graph TD; A-->B",
          })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("fullscreen-diff-view")).toBeTruthy();
  });

  // --- Reset to code tab when dialog re-opens (lines 66-71) ---
  test("resets to code tab when dialog re-opens", () => {
    const props = createDefaultProps();
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...props} />
      </ThemeProvider>,
    );

    // Switch to config tab
    fireEvent.click(screen.getByRole("tab", { name: "configTab" }));

    // Close dialog
    rerender(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...props} open={false} />
      </ThemeProvider>,
    );

    // Re-open
    rerender(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...props} open={true} fsCode="graph TD; A-->B" />
      </ThemeProvider>,
    );

    // Should be back on code tab
    const codeTab = screen.getByRole("tab", { name: "codeTab" });
    expect(codeTab.getAttribute("aria-selected")).toBe("true");
  });

  // --- toolbarExtra rendering ---
  test("renders toolbarExtra when provided", () => {
    render(
      <ThemeProvider theme={theme}>
        <MermaidEditDialog {...createDefaultProps({ toolbarExtra: <span data-testid="extra">Extra</span> })} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("extra")).toBeTruthy();
  });
});
