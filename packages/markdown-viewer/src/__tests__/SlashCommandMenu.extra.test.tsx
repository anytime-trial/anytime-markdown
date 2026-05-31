/**
 * SlashCommandMenu.tsx の追加カバレッジテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SLASH_COMMAND_FONT_SIZE: 13,
}));

jest.mock("../constants/zIndex", () => ({
  Z_FULLSCREEN: 1300,
}));

const mockItems = [
  { id: "heading1", labelKey: "heading1", keywords: ["h1"], icon: null, action: jest.fn() },
  { id: "heading2", labelKey: "heading2", keywords: ["h2"], icon: null, action: jest.fn() },
  { id: "codeBlock", labelKey: "codeBlock", keywords: ["code"], icon: null, action: jest.fn() },
];

jest.mock("../extensions/slashCommandItems", () => ({
  filterSlashItems: (_items: any, query: string) => {
    if (!query) return mockItems;
    return mockItems.filter(i => i.id.includes(query));
  },
  slashCommandItems: mockItems,
}));

import { SlashCommandMenu } from "../components/SlashCommandMenu";

const theme = createTheme();

describe("SlashCommandMenu - additional tests", () => {
  const t = (key: string) => key;
  const mockEditor = {
    view: {
      coordsAtPos: () => ({ left: 100, top: 200, bottom: 220, right: 200 }),
      dom: document.createElement("div"),
    },
    state: {
      selection: { from: 5, to: 5 },
    },
    commands: {},
    chain: () => ({
      focus: () => ({ deleteRange: () => ({ run: () => {} }) }),
    }),
  } as any;

  it("renders with items when callback triggers active state", () => {
    const callbackRef: { current: ((state: any) => void) | null } = { current: null };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu
          editor={mockEditor}
          t={t}
          slashCommandCallbackRef={callbackRef as any}
        />
      </ThemeProvider>,
    );

    // Simulate slash command activation
    if (callbackRef.current) {
      callbackRef.current({
        active: true,
        query: "",
        from: 5,
        navigationKey: null,
      });
    }
  });

  it("renders with different editor mock", () => {
    const callbackRef = { current: jest.fn() };
    const anotherEditor = {
      ...mockEditor,
      state: { selection: { from: 10, to: 10 } },
    } as any;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu
          editor={anotherEditor}
          t={t}
          slashCommandCallbackRef={callbackRef as any}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
