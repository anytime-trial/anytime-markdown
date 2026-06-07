/**
 * SlashCommandMenu.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";

jest.mock("../constants/colors", () => ({
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SLASH_COMMAND_FONT_SIZE: 13,
}));

jest.mock("../constants/zIndex", () => ({
  Z_FULLSCREEN: 1300,
}));

jest.mock("../extensions/slashCommandItems", () => ({
  filterSlashItems: () => [],
  slashCommandItems: [],
}));

import { SlashCommandMenu } from "../components/SlashCommandMenu";


describe("SlashCommandMenu", () => {
  const t = (key: string) => key;

  const mockEditor = {
    view: {
      coordsAtPos: () => ({ left: 0, top: 0, bottom: 20, right: 100 }),
      dom: document.createElement("div"),
    },
    state: {
      selection: { from: 0, to: 0 },
    },
    commands: {},
    chain: () => ({
      focus: () => ({ deleteRange: () => ({ run: () => {} }) }),
    }),
  } as any;

  it("renders without crashing", () => {
    const callbackRef = { current: jest.fn() };
    const { container } = render(
        <>
        <SlashCommandMenu
          editor={mockEditor}
          t={t}
          slashCommandCallbackRef={callbackRef as any}
        />
        </>,
    );
    expect(container).toBeTruthy();
  });
});
