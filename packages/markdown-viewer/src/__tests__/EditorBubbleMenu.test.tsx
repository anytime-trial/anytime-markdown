/**
 * EditorBubbleMenu.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";

jest.mock("@anytime-markdown/markdown-react/menus", () => ({
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
        <>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
    expect(container.querySelector("[data-testid='bubble-menu']")).toBeTruthy();
  });

  it("renders with readonlyMode", () => {
    const { container } = render(
        <>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          readonlyMode
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with reviewMode", () => {
    const { container } = render(
        <>
        <EditorBubbleMenu
          editor={mockEditor}
          onLink={jest.fn()}
          reviewMode
          executeInReviewMode={jest.fn()}
          t={t}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });
});
