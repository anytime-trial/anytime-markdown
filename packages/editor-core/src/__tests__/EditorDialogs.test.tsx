/**
 * EditorDialogs.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getActionSelected: () => "rgba(0,0,0,0.08)",
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SHORTCUT_HINT_FONT_SIZE: 11,
}));

jest.mock("../constants/shortcuts", () => ({
  KEYBOARD_SHORTCUTS: [],
}));

jest.mock("../version", () => ({
  APP_VERSION: "0.0.0-test",
}));

// EditorDialogs is a default export
const { EditorDialogs } = jest.requireActual("../components/EditorDialogs") as any;

const theme = createTheme();
const t = (key: string) => key;

describe("EditorDialogs", () => {
  const defaultProps = {
    commentDialogOpen: false,
    setCommentDialogOpen: jest.fn(),
    commentText: "",
    setCommentText: jest.fn(),
    handleCommentInsert: jest.fn(),
    linkDialogOpen: false,
    setLinkDialogOpen: jest.fn(),
    linkUrl: "",
    setLinkUrl: jest.fn(),
    handleLinkInsert: jest.fn(),
    imageDialogOpen: false,
    setImageDialogOpen: jest.fn(),
    imageUrl: "",
    setImageUrl: jest.fn(),
    imageAlt: "",
    setImageAlt: jest.fn(),
    handleImageInsert: jest.fn(),
    shortcutDialogOpen: false,
    setShortcutDialogOpen: jest.fn(),
    versionDialogOpen: false,
    setVersionDialogOpen: jest.fn(),
    locale: "en" as const,
    t,
  };

  it("renders without crashing with all dialogs closed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...defaultProps} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
