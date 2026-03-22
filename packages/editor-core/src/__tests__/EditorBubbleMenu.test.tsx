/**
 * EditorBubbleMenu.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

jest.mock("../constants/shortcuts", () => ({
  modKey: "Ctrl",
}));

jest.mock("../types", () => ({
  getEditorStorage: jest.fn().mockReturnValue({
    commentDialog: { open: null },
  }),
}));

import { EditorBubbleMenu } from "../components/EditorBubbleMenu";

const theme = createTheme();

describe("EditorBubbleMenu", () => {
  const t = (key: string) => key;

  const mockEditor = {
    isActive: jest.fn().mockReturnValue(false),
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: jest.fn() }),
        toggleItalic: () => ({ run: jest.fn() }),
        toggleUnderline: () => ({ run: jest.fn() }),
        toggleStrike: () => ({ run: jest.fn() }),
        toggleHighlight: () => ({ run: jest.fn() }),
        toggleCode: () => ({ run: jest.fn() }),
        run: jest.fn(),
      }),
    }),
    commands: {
      focus: jest.fn(),
    },
    state: {
      selection: { from: 0, to: 5, empty: false },
    },
    storage: {},
  } as any;

  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    expect(container.querySelector("[data-testid='bubble-menu']")).toBeTruthy();
  });

  it("renders with readonlyMode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          readonlyMode
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with reviewMode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          reviewMode
          executeInReviewMode={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
