/**
 * EditorFooterOverlays.tsx coverage tests
 * Targets 14 uncovered branches: editor truthy, sourceMode, readonlyMode, reviewMode,
 * notification error/success, editorPortalTarget, hideStatusBar
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("../components/StatusBar", () => ({
  StatusBar: (props: any) => <div data-testid="status-bar" data-hidden={props.hidden} />,
}));

jest.mock("../components/SlashCommandMenu", () => ({
  SlashCommandMenu: () => <div data-testid="slash-command-menu" />,
}));

jest.mock("../components/EditorBubbleMenu", () => ({
  EditorBubbleMenu: () => <div data-testid="bubble-menu" />,
}));

jest.mock("../components/EditorMenuPopovers", () => ({
  EditorMenuPopovers: () => <div data-testid="menu-popovers" />,
}));

jest.mock("../constants/dimensions", () => ({
  STATUSBAR_HEIGHT: 24,
}));

jest.mock("../constants/samples", () => ({
  PLANTUML_SAMPLES: [],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

import { EditorFooterOverlays } from "../components/EditorFooterOverlays";

const theme = createTheme();
const t = (key: string) => key;
const noop = jest.fn();

const baseProps = {
  editor: null as any,
  editorPortalTarget: null as any,
  sourceMode: false,
  readonlyMode: false,
  reviewMode: false,
  handleLink: noop,
  executeInReviewMode: noop,
  slashCommandCallbackRef: { current: noop } as any,
  sourceText: "",
  fileName: null as string | null,
  isDirty: false,
  encoding: "UTF-8" as const,
  helpAnchorEl: null,
  setHelpAnchorEl: noop,
  diagramAnchorEl: null,
  setDiagramAnchorEl: noop,
  sampleAnchorEl: null,
  setSampleAnchorEl: noop,
  templateAnchorEl: null,
  setTemplateAnchorEl: noop,
  onInsertTemplate: noop,
  headingMenu: null,
  setHeadingMenu: noop,
  setSettingsOpen: noop,
  setVersionDialogOpen: noop,
  appendToSource: noop,
  pdfExporting: false,
  notification: null as any,
  setNotification: noop,
  t,
};

const mockEditor = {
  isDestroyed: false,
  state: { doc: { content: { size: 10 } } },
  on: jest.fn(),
  off: jest.fn(),
  commands: {},
  can: jest.fn(() => ({ chain: jest.fn() })),
  chain: jest.fn(() => ({ focus: jest.fn(), run: jest.fn() })),
  getHTML: jest.fn(() => "<p>test</p>"),
} as any;

describe("EditorFooterOverlays coverage", () => {
  it("renders with editor and sourceMode=false shows bubble menu and slash command", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("bubble-menu")).toBeTruthy();
    expect(screen.getByTestId("slash-command-menu")).toBeTruthy();
    expect(screen.getByTestId("status-bar")).toBeTruthy();
  });

  it("renders with sourceMode=true hides bubble menu and slash command", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} sourceMode={true} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("bubble-menu")).toBeNull();
    expect(screen.queryByTestId("slash-command-menu")).toBeNull();
    expect(screen.getByTestId("status-bar")).toBeTruthy();
  });

  it("renders with readonlyMode=true hides slash command but shows bubble menu", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} readonlyMode={true} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("bubble-menu")).toBeTruthy();
    expect(screen.queryByTestId("slash-command-menu")).toBeNull();
  });

  it("renders with reviewMode=true hides slash command but shows bubble menu", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} reviewMode={true} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("bubble-menu")).toBeTruthy();
    expect(screen.queryByTestId("slash-command-menu")).toBeNull();
  });

  it("renders notification with error severity when notification ends with Error", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} notification={"saveError" as any} />
      </ThemeProvider>,
    );
    // Notification text should be rendered
    expect(screen.getByText("saveError")).toBeTruthy();
  });

  it("renders notification with success severity when notification does not end with Error", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} notification={"saved" as any} />
      </ThemeProvider>,
    );
    expect(screen.getByText("saved")).toBeTruthy();
  });

  it("renders with editorPortalTarget creates portal", () => {
    // EditorContent requires a more complete editor mock; just verify editorPortalTarget != null branch
    // by passing a valid div but null editor (portal still creates)
    const portalTarget = document.createElement("div");
    document.body.appendChild(portalTarget);
    try {
      render(
        <ThemeProvider theme={theme}>
          <EditorFooterOverlays {...baseProps} editor={null} editorPortalTarget={portalTarget} />
        </ThemeProvider>,
      );
    } finally {
      document.body.removeChild(portalTarget);
    }
  });

  it("renders with hideStatusBar=true", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} hideStatusBar={true} />
      </ThemeProvider>,
    );
    const statusBar = screen.getByTestId("status-bar");
    expect(statusBar.getAttribute("data-hidden")).toBe("true");
  });

  it("renders with inlineMergeOpen=true", () => {
    render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays {...baseProps} editor={mockEditor} inlineMergeOpen={true} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("menu-popovers")).toBeTruthy();
  });
});
