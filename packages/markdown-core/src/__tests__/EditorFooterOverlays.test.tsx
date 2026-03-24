/**
 * EditorFooterOverlays.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("../components/StatusBar", () => ({
  StatusBar: () => <div data-testid="status-bar" />,
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

describe("EditorFooterOverlays", () => {
  it("renders without crashing with null editor", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorFooterOverlays
          editor={null}
          editorPortalTarget={null}
          sourceMode={false}
          readonlyMode={false}
          reviewMode={false}
          handleLink={noop}
          executeInReviewMode={noop}
          slashCommandCallbackRef={{ current: noop } as any}
          sourceText=""
          fileName={null}
          isDirty={false}
          encoding="UTF-8"
          helpAnchorEl={null}
          setHelpAnchorEl={noop}
          diagramAnchorEl={null}
          setDiagramAnchorEl={noop}
          sampleAnchorEl={null}
          setSampleAnchorEl={noop}
          templateAnchorEl={null}
          setTemplateAnchorEl={noop}
          onInsertTemplate={noop}
          headingMenu={null}
          setHeadingMenu={noop}
          setSettingsOpen={noop}
          setVersionDialogOpen={noop}
          appendToSource={noop}
          pdfExporting={false}
          notification={null}
          setNotification={noop}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
