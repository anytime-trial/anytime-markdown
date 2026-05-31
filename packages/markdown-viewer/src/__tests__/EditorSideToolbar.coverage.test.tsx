/**
 * EditorSideToolbar.tsx のカバレッジテスト
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  SIDE_TOOLBAR_ICON_SIZE: 20,
  SIDE_TOOLBAR_WIDTH: 40,
}));

import { EditorSideToolbar } from "../components/EditorSideToolbar";

const theme = createTheme();
const t = (key: string) => key;

function renderToolbar(props: Partial<React.ComponentProps<typeof EditorSideToolbar>> = {}) {
  const defaultProps = {
    sourceMode: false,
    outlineOpen: false,
    commentOpen: false,
    onToggleComment: jest.fn(),
    t,
    ...props,
  };
  return render(
    <ThemeProvider theme={theme}>
      <EditorSideToolbar {...defaultProps} />
    </ThemeProvider>,
  );
}

describe("EditorSideToolbar", () => {
  it("renders outline button", () => {
    renderToolbar();
    expect(screen.getByLabelText("outline")).toBeTruthy();
  });

  it("renders comment button", () => {
    renderToolbar();
    expect(screen.getByLabelText("commentPanel")).toBeTruthy();
  });

  it("clicking outline button when closed opens outline", () => {
    const onToggleOutline = jest.fn();
    const onToggleComment = jest.fn();
    renderToolbar({
      outlineOpen: false,
      onToggleOutline,
      onToggleComment,
    });
    fireEvent.click(screen.getByLabelText("outline"));
    expect(onToggleComment).toHaveBeenCalledWith(false);
    expect(onToggleOutline).toHaveBeenCalled();
  });

  it("clicking outline button when open closes outline", () => {
    const onToggleOutline = jest.fn();
    renderToolbar({ outlineOpen: true, onToggleOutline });
    fireEvent.click(screen.getByLabelText("outline"));
    expect(onToggleOutline).toHaveBeenCalled();
  });

  it("clicking comment button when closed opens comment", () => {
    const onToggleOutline = jest.fn();
    const onToggleComment = jest.fn();
    renderToolbar({
      commentOpen: false,
      onToggleOutline,
      onToggleComment,
    });
    fireEvent.click(screen.getByLabelText("commentPanel"));
    expect(onToggleComment).toHaveBeenCalledWith(true);
  });

  it("clicking comment button when open closes comment", () => {
    const onToggleComment = jest.fn();
    renderToolbar({ commentOpen: true, onToggleComment });
    fireEvent.click(screen.getByLabelText("commentPanel"));
    expect(onToggleComment).toHaveBeenCalledWith(false);
  });

  it("renders explorer button when onToggleExplorer provided", () => {
    renderToolbar({ onToggleExplorer: jest.fn() });
    expect(screen.getByLabelText("explorer")).toBeTruthy();
  });

  it("clicking explorer button toggles explorer", () => {
    const onToggleExplorer = jest.fn();
    const onToggleComment = jest.fn();
    renderToolbar({
      onToggleExplorer,
      onToggleComment,
      explorerOpen: false,
    });
    fireEvent.click(screen.getByLabelText("explorer"));
    expect(onToggleExplorer).toHaveBeenCalled();
  });

  it("clicking explorer when open closes it", () => {
    const onToggleExplorer = jest.fn();
    renderToolbar({
      onToggleExplorer,
      explorerOpen: true,
    });
    fireEvent.click(screen.getByLabelText("explorer"));
    expect(onToggleExplorer).toHaveBeenCalled();
  });

  it("renders settings button when onOpenSettings provided", () => {
    renderToolbar({ onOpenSettings: jest.fn() });
    expect(screen.getByLabelText("editorSettings")).toBeTruthy();
  });

  it("clicking settings opens settings", () => {
    const onOpenSettings = jest.fn();
    renderToolbar({ onOpenSettings });
    fireEvent.click(screen.getByLabelText("editorSettings"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("closes explorer when opening outline", () => {
    const onToggleOutline = jest.fn();
    const onToggleExplorer = jest.fn();
    const onToggleComment = jest.fn();
    renderToolbar({
      outlineOpen: false,
      explorerOpen: true,
      onToggleOutline,
      onToggleExplorer,
      onToggleComment,
    });
    fireEvent.click(screen.getByLabelText("outline"));
    expect(onToggleExplorer).toHaveBeenCalled();
  });

  it("closes outline when opening explorer", () => {
    const onToggleOutline = jest.fn();
    const onToggleExplorer = jest.fn();
    const onToggleComment = jest.fn();
    renderToolbar({
      outlineOpen: true,
      explorerOpen: false,
      onToggleOutline,
      onToggleExplorer,
      onToggleComment,
    });
    fireEvent.click(screen.getByLabelText("explorer"));
    expect(onToggleOutline).toHaveBeenCalled();
  });
});
