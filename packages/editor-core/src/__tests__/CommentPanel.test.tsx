/**
 * CommentPanel.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react", () => ({
  useEditorState: ({ selector }: any) => {
    // Return empty array as fallback (selector needs valid editor)
    return [];
  },
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getPrimaryMain: () => "#1976d2",
  getTextDisabled: () => "#999",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  BADGE_NUMBER_FONT_SIZE: 10,
  COMMENT_BODY_FONT_SIZE: 13,
  COMMENT_INPUT_FONT_SIZE: 13,
  COMMENT_PANEL_WIDTH: 320,
  PANEL_BUTTON_FONT_SIZE: 12,
  PANEL_HEADER_MIN_HEIGHT: 40,
  SMALL_BUTTON_FONT_SIZE: 11,
  SMALL_CAPTION_FONT_SIZE: 10,
}));

jest.mock("../extensions/commentExtension", () => ({
  commentDataPluginKey: { getState: () => new Map() },
}));

jest.mock("../types/imageAnnotation", () => ({
  parseAnnotations: () => [],
  serializeAnnotations: () => "",
}));

import { CommentPanel } from "../components/CommentPanel";

const theme = createTheme();

describe("CommentPanel", () => {
  const t = (key: string) => key;

  const mockEditor = {
    state: {
      doc: {
        descendants: jest.fn(),
      },
    },
    commands: {
      setCommentHighlight: jest.fn(),
    },
    view: {
      dispatch: jest.fn(),
    },
    isDestroyed: false,
  } as any;

  it("renders without crashing when closed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel
          editor={mockEditor}
          open={false}
          onClose={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders without crashing when open", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel
          editor={mockEditor}
          open={true}
          onClose={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
