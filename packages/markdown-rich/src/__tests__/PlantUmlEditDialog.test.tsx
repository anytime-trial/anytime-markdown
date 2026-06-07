/**
 * PlantUmlEditDialog.tsx のスモークテスト
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
    FS_TAB_FONT_SIZE: 12,
    FS_TOOLBAR_HEIGHT: 40,
    PLANTUML_SAMPLES: [],
    useEditorSettingsContext: () => ({
      fontSize: 14,
      lineHeight: 1.6,
      fontFamily: "monospace",
    }),
    computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
    applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
    buildPlantUmlUrl: () => "http://plantuml.test/svg/test",
    EditDialogHeader: () => <div data-testid="edit-dialog-header" />,
    EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="wrapper">{children}</div> : null,
}));

jest.mock("../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "",
}));

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: () => <div />,
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: () => <div data-testid="textarea" />,
}));

jest.mock("../components/SamplePanel", () => ({
  SamplePanel: () => <div />,
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => null,
}));

import { PlantUmlEditDialog } from "../components/PlantUmlEditDialog";

const t = (key: string) => key;

describe("PlantUmlEditDialog", () => {
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
      <PlantUmlEditDialog
        open={false}
        onClose={jest.fn()}
        label="PlantUML"
        plantUmlUrl=""
        code=""
        fsCode=""
        onFsCodeChange={jest.fn()}
        onFsTextChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
        fsZP={fsZP as any}
        t={t}
      />,
    );
    expect(container).toBeTruthy();
  });

  it("renders when open", () => {
    const { container } = render(
      <PlantUmlEditDialog
        open={true}
        onClose={jest.fn()}
        label="PlantUML"
        plantUmlUrl="http://plantuml.test/svg/test"
        code="@startuml\nA->B\n@enduml"
        fsCode="@startuml\nA->B\n@enduml"
        onFsCodeChange={jest.fn()}
        onFsTextChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={{ query: "", setQuery: jest.fn(), replaceText: "", setReplaceText: jest.fn(), matches: [], currentIndex: 0, goToNext: jest.fn(), goToPrev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn(), caseSensitive: false, toggleCaseSensitive: jest.fn(), wholeWord: false, toggleWholeWord: jest.fn(), useRegex: false, toggleUseRegex: jest.fn() } as any}
        fsZP={fsZP as any}
        t={t}
      />,
    );
    expect(container).toBeTruthy();
  });
});
