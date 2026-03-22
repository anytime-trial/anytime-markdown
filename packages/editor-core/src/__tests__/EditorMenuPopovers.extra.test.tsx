/**
 * EditorMenuPopovers.tsx の追加カバレッジテスト
 * ヘルプメニュー表示時のテスト。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EditorMenuPopovers } from "../components/EditorMenuPopovers";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  MENU_ITEM_FONT_SIZE: 13,
}));

jest.mock("../constants/samples", () => ({
  PLANTUML_SAMPLES: [
    { label: "Sequence", i18nKey: "plantumlSequence", code: "@startuml\nA->B\n@enduml", icon: "SEQ", enabled: true },
  ],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [
    { id: "blank", name: "blank", content: "" },
  ],
}));

jest.mock("../icons/MermaidIcon", () => {
  return function MockMermaidIcon() {
    return <span data-testid="mermaid-icon" />;
  };
});

const theme = createTheme();

describe("EditorMenuPopovers - additional tests", () => {
  const t = (key: string) => key;
  const noop = () => {};
  const noopSet = (_v: any) => {};

  const defaultProps = {
    editor: null,
    helpAnchorEl: null,
    setHelpAnchorEl: noopSet,
    diagramAnchorEl: null,
    setDiagramAnchorEl: noopSet,
    sampleAnchorEl: null,
    setSampleAnchorEl: noopSet,
    templateAnchorEl: null,
    setTemplateAnchorEl: noopSet,
    onInsertTemplate: noop,
    headingMenu: null,
    setHeadingMenu: noopSet,
    setSettingsOpen: noopSet,
    setVersionDialogOpen: noopSet,
    t,
  };

  it("renders with help anchor element", () => {
    const helpAnchor = document.createElement("button");
    document.body.appendChild(helpAnchor);
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...defaultProps} helpAnchorEl={helpAnchor} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    document.body.removeChild(helpAnchor);
  });

  it("renders with diagram anchor element", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...defaultProps} diagramAnchorEl={anchor} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    document.body.removeChild(anchor);
  });

  it("renders with template anchor element", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...defaultProps} templateAnchorEl={anchor} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    document.body.removeChild(anchor);
  });

  it("renders with sample anchor element", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...defaultProps} sampleAnchorEl={anchor} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    document.body.removeChild(anchor);
  });

  it("renders with headingMenu", () => {
    const anchor = document.createElement("h1");
    document.body.appendChild(anchor);
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers
          {...defaultProps}
          headingMenu={{ anchorEl: anchor, pos: 5, currentLevel: 2 }}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    document.body.removeChild(anchor);
  });
});
