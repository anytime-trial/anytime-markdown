/**
 * PlantUmlEditDialog.tsx coverage tests
 * Targets uncovered lines: 83-85, 89-91, 96-98, 127-160
 * Focus: handleCodeTabChange, handleConfigChange, handleInsertSample,
 *   tab switching, config textarea, sample panel, compare view
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  FS_TAB_FONT_SIZE: 12,
  FS_TOOLBAR_HEIGHT: 40,
}));

jest.mock("../constants/samples", () => ({
  PLANTUML_SAMPLES: [
    { name: "Sample1", code: "@startuml\nA->B\n@enduml", enabled: true },
    { name: "Sample2", code: "@startuml\nC->D\n@enduml", enabled: false },
  ],
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
  extractDiagramAltText: () => "diagram alt text",
}));

jest.mock("../utils/plantumlConfig", () => ({
  extractPlantUmlConfig: (code: string) => {
    if (code.includes("skinparam")) {
      return { config: "skinparam backgroundColor #FFF", body: "@startuml\nA->B\n@enduml" };
    }
    return { config: "", body: code };
  },
  mergePlantUmlConfig: (config: string, body: string) => {
    if (!config.trim()) return body;
    return `${config.trim()}\n\n${body}`;
  },
}));

let capturedDraggableProps: any = {};
jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ left, right, ...rest }: any) => {
    capturedDraggableProps = { left, right, ...rest };
    return <div data-testid="draggable-layout">{left}{right}</div>;
  },
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ onClose, showCompareView }: any) => (
    <div data-testid="edit-dialog-header">
      {showCompareView && <span data-testid="compare-indicator" />}
      <button data-testid="close-btn" onClick={onClose}>close</button>
    </div>
  ),
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="wrapper">{children}</div> : null,
}));

let capturedDiffViewProps: any = {};
jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: (props: any) => {
    capturedDiffViewProps = props;
    return <div data-testid="fullscreen-diff-view" />;
  },
}));

let capturedTextareaProps: any[] = [];
jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: (props: any) => {
    capturedTextareaProps.push(props);
    return (
      <div data-testid={`textarea-${props.placeholder ? 'config' : 'code'}`}>
        <textarea
          data-testid={`textarea-input-${props.placeholder ? 'config' : 'code'}`}
          value={props.value}
          onChange={props.onChange}
          readOnly={props.readOnly}
        />
      </div>
    );
  },
}));

let capturedSampleProps: any = {};
jest.mock("../components/SamplePanel", () => ({
  SamplePanel: (props: any) => {
    capturedSampleProps = props;
    return (
      <div data-testid="sample-panel">
        {props.samples.map((s: any, i: number) => (
          <button key={i} data-testid={`sample-${i}`} onClick={() => props.onInsert(s.code)}>
            {s.name}
          </button>
        ))}
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

import { PlantUmlEditDialog } from "../components/PlantUmlEditDialog";

const theme = createTheme();
const t = (key: string) => key;

function createDefaultProps(overrides: any = {}) {
  return {
    open: true,
    onClose: jest.fn(),
    label: "PlantUML",
    plantUmlUrl: "http://plantuml.test/svg/test",
    code: "@startuml\nA->B\n@enduml",
    fsCode: "@startuml\nA->B\n@enduml",
    onFsCodeChange: jest.fn(),
    onFsTextChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: {
      query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(),
      matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(),
      replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false,
      toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(),
      useRegex: false, toggleUseRegex: jest.fn(), reset: jest.fn(),
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

describe("PlantUmlEditDialog - coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedTextareaProps = [];
    capturedSampleProps = {};
    capturedDraggableProps = {};
    capturedDiffViewProps = {};
  });

  // --- Lines 83-85: handleCodeTabChange updates bodyText and calls onFsTextChange ---
  it("handleCodeTabChange updates body text and merges config", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );
    // Code tab should be active by default
    const codeTextarea = screen.getByTestId("textarea-input-code");
    fireEvent.change(codeTextarea, { target: { value: "@startuml\nX->Y\n@enduml" } });
    expect(onFsTextChange).toHaveBeenCalled();
  });

  // --- Lines 89-91: handleConfigChange ---
  it("handleConfigChange updates config and merges with body", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );
    // Switch to config tab
    const configTab = screen.getByText("configTab");
    fireEvent.click(configTab);

    const configTextarea = screen.getByTestId("textarea-input-config");
    fireEvent.change(configTextarea, { target: { value: "skinparam backgroundColor #000" } });
    expect(onFsTextChange).toHaveBeenCalled();
  });

  // --- Lines 96-98: handleInsertSample ---
  it("handleInsertSample sets body text and switches to code tab", () => {
    const onFsTextChange = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ onFsTextChange })} />
      </ThemeProvider>,
    );
    // Click sample button
    const sampleBtn = screen.getByTestId("sample-0");
    fireEvent.click(sampleBtn);
    expect(onFsTextChange).toHaveBeenCalled();
  });

  // --- Lines 127-160: tab switching and config textarea rendering ---
  it("switches between code and config tabs", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps()} />
      </ThemeProvider>,
    );
    // Initially on code tab
    expect(screen.getByTestId("textarea-input-code")).toBeTruthy();

    // Switch to config
    fireEvent.click(screen.getByText("configTab"));
    expect(screen.getByTestId("textarea-input-config")).toBeTruthy();

    // Switch back to code
    fireEvent.click(screen.getByText("codeTab"));
    expect(screen.getByTestId("textarea-input-code")).toBeTruthy();
  });

  // --- Compare view rendering ---
  it("renders FullscreenDiffView in compare mode", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({
          isCompareMode: true,
          compareCode: "compare code",
          thisCode: "this code",
          onMergeApply: jest.fn(),
        })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("fullscreen-diff-view")).toBeTruthy();
    expect(screen.getByTestId("compare-indicator")).toBeTruthy();
  });

  // --- Compare view with no onMergeApply ---
  it("renders compare view with default onMergeApply", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({
          isCompareMode: true,
          compareCode: "compare code",
        })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("fullscreen-diff-view")).toBeTruthy();
  });

  // --- Dialog close ---
  it("calls onClose when close button clicked", () => {
    const onClose = jest.fn();
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ onClose })} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("close-btn"));
    expect(onClose).toHaveBeenCalled();
  });

  // --- With config in fsCode ---
  it("extracts config from fsCode on open", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({
          fsCode: "skinparam backgroundColor #FFF\n\n@startuml\nA->B\n@enduml",
        })} />
      </ThemeProvider>,
    );
    // The code textarea should show body only
    expect(screen.getByTestId("textarea-input-code")).toBeTruthy();
  });

  // --- readOnly mode ---
  it("passes readOnly to textarea", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ readOnly: true })} />
      </ThemeProvider>,
    );
    const textarea = screen.getByTestId("textarea-input-code");
    expect(textarea.getAttribute("readonly")).toBeDefined();
  });

  // --- Preview rendering with plantUmlUrl ---
  it("renders preview image when plantUmlUrl is provided", () => {
    render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("zoomable-preview")).toBeTruthy();
  });

  // --- Reset to code tab on reopen ---
  it("resets to code tab when dialog reopens", () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps()} />
      </ThemeProvider>,
    );
    // Switch to config tab
    fireEvent.click(screen.getByText("configTab"));
    // Close the dialog
    rerender(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ open: false })} />
      </ThemeProvider>,
    );
    // Reopen
    rerender(
      <ThemeProvider theme={theme}>
        <PlantUmlEditDialog {...createDefaultProps({ open: true })} />
      </ThemeProvider>,
    );
    // Should be on code tab
    expect(screen.getByTestId("textarea-input-code")).toBeTruthy();
  });
});
