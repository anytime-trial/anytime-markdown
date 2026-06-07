/**
 * EditorMenuPopovers.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
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


describe("EditorMenuPopovers", () => {
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

  it("renders without crashing when all anchors are null", () => {
    const { container } = render(
        <EditorMenuPopovers {...defaultProps} />,
    );
    expect(container).toBeTruthy();
  });

  it("renders without crashing with sourceMode", () => {
    const { container } = render(
        <EditorMenuPopovers {...defaultProps} sourceMode />,
    );
    expect(container).toBeTruthy();
  });

  it("renders with hideVersionInfo", () => {
    const { container } = render(
        <EditorMenuPopovers {...defaultProps} hideVersionInfo />,
    );
    expect(container).toBeTruthy();
  });
});
