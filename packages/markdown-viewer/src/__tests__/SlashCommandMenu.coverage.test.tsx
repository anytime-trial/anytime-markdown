/**
 * SlashCommandMenu.tsx coverage test
 * Targets uncovered lines: 53-65, 78-79, 83-85, 88-90, 94-110, 113-115,
 * 133-134, 140-157, 163-204
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

jest.mock("../constants/colors", () => ({
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SLASH_COMMAND_FONT_SIZE: 13,
}));

jest.mock("../constants/zIndex", () => ({
  Z_FULLSCREEN: 1300,
}));

const mockAction = jest.fn();
const mockItems = [
  { id: "heading1", labelKey: "heading1", keywords: ["h1"], icon: <span>H1</span>, action: mockAction },
  { id: "heading2", labelKey: "heading2", keywords: ["h2"], icon: <span>H2</span>, action: mockAction },
  { id: "codeBlock", labelKey: "codeBlock", keywords: ["code"], icon: <span>CB</span>, action: mockAction },
];

jest.mock("../extensions/slashCommandItems", () => ({
  filterSlashItems: (_items: any, query: string, _t: any) => {
    if (!query) return mockItems;
    return mockItems.filter((i) => i.id.toLowerCase().includes(query.toLowerCase()));
  },
  slashCommandItems: mockItems,
}));

import { SlashCommandMenu } from "../components/SlashCommandMenu";

const theme = createTheme();

describe("SlashCommandMenu - coverage tests", () => {
  const t = (key: string) => key;

  function createEditor() {
    return {
      view: {
        coordsAtPos: () => ({ left: 100, top: 200, bottom: 220, right: 200 }),
        dom: document.createElement("div"),
      },
      state: {
        selection: { from: 5, to: 5 },
      },
      commands: {},
      chain: () => ({
        focus: () => ({ deleteRange: () => ({ run: jest.fn() }) }),
      }),
    } as any;
  }

  it("shows menu items when activated with empty query", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // Menu items should be rendered
    expect(screen.getByText("heading1")).toBeTruthy();
    expect(screen.getByText("heading2")).toBeTruthy();
    expect(screen.getByText("codeBlock")).toBeTruthy();
  });

  it("shows no results message when query has no matches", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    // Override filterSlashItems to return empty for "zzz"
    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "zzz", from: 5, navigationKey: null });
    });

    expect(screen.getByText("slashCommandNoResults")).toBeTruthy();
  });

  it("handles ArrowDown navigation", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // First activate
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // ArrowDown
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowDown" });
    });

    // Second item should be selected
    const items = screen.getAllByRole("menuitem");
    expect(items[1].getAttribute("aria-current")).toBe("true");
  });

  it("handles ArrowDown wrap-around", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // Navigate past last item
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowDown" });
    });
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowDown" });
    });
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowDown" });
    });

    // Should wrap to first
    const items = screen.getAllByRole("menuitem");
    expect(items[0].getAttribute("aria-current")).toBe("true");
  });

  it("handles ArrowUp navigation", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // ArrowUp from 0 should wrap to last
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowUp" });
    });

    const items = screen.getAllByRole("menuitem");
    expect(items[2].getAttribute("aria-current")).toBe("true");
  });

  it("handles Escape navigation to deactivate", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    expect(screen.queryAllByRole("menuitem").length).toBeGreaterThan(0);

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "Escape" });
    });

    // Menu should be hidden
    expect(screen.queryAllByRole("menuitem").length).toBe(0);
  });

  it("handles Enter navigation to execute command", () => {
    jest.useFakeTimers();
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // Activate menu
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // Press Enter
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "Enter" });
    });

    // Execute the deferred setTimeout
    act(() => {
      jest.runAllTimers();
    });

    expect(mockAction).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("handles deactivation via callback (active: false)", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // Activate
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    expect(screen.queryAllByRole("menuitem").length).toBeGreaterThan(0);

    // Deactivate
    act(() => {
      callbackRef.current({ active: false, query: "", from: 5, navigationKey: null });
    });

    expect(screen.queryAllByRole("menuitem").length).toBe(0);
  });

  it("handles click on menu item (executeCommand)", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // Activate
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // Click the second item
    const items = screen.getAllByRole("menuitem");
    fireEvent.click(items[1]);

    expect(mockAction).toHaveBeenCalled();
  });

  it("handles coordsAtPos throwing an error", () => {
    const editor = createEditor();
    editor.view.coordsAtPos = () => {
      throw new Error("invalid pos");
    };
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    // Menu should not render since virtualAnchor is null
    expect(screen.queryAllByRole("menuitem").length).toBe(0);
    consoleSpy.mockRestore();
  });

  it("resets callback on unmount", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    const { unmount } = render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // Activate first to set callback
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });

    unmount();

    // After unmount, callback should be a noop
    expect(() => callbackRef.current({ active: true, query: "", from: 5, navigationKey: null })).not.toThrow();
  });

  it("resets selectedIndex when query changes (non-navigation)", () => {
    const editor = createEditor();
    const callbackRef: { current: ((state: any) => void) } = { current: () => {} };

    render(
      <ThemeProvider theme={theme}>
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={callbackRef as any} />
      </ThemeProvider>,
    );

    // Activate and navigate down
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: null });
    });
    act(() => {
      callbackRef.current({ active: true, query: "", from: 5, navigationKey: "ArrowDown" });
    });

    // Change query with navigationKey: null -> should reset selectedIndex to 0
    act(() => {
      callbackRef.current({ active: true, query: "heading", from: 5, navigationKey: null });
    });

    const items = screen.getAllByRole("menuitem");
    expect(items[0].getAttribute("aria-current")).toBe("true");
  });
});
