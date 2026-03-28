import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolbarMobileMenu } from "../components/ToolbarMobileMenu";

const t = (key: string) => key;

function renderMenu(overrides: Partial<Parameters<typeof ToolbarMobileMenu>[0]> = {}) {
  const anchorEl = document.createElement("button");
  document.body.appendChild(anchorEl);
  const props = {
    anchorEl,
    onClose: jest.fn(),
    mobileMoreRef: { current: null },
    outlineOpen: false,
    inlineMergeOpen: false,
    sourceMode: false,
    onToggleOutline: jest.fn(),
    onSetHelpAnchor: jest.fn(),
    t,
    ...overrides,
  };
  const result = render(<ToolbarMobileMenu {...(props as any)} />);
  return { ...result, ...props };
}

describe("ToolbarMobileMenu coverage", () => {
  it("renders outline menu item by default", () => {
    renderMenu();
    expect(screen.getByText("outline")).toBeTruthy();
  });

  it("hides outline when hideOutline is true", () => {
    renderMenu({ hideOutline: true });
    expect(screen.queryByText("outline")).toBeNull();
  });

  it("shows comment menu item when onToggleComments provided", () => {
    renderMenu({ onToggleComments: jest.fn() });
    expect(screen.getByText("commentPanel")).toBeTruthy();
  });

  it("hides comments when hideComments is true", () => {
    renderMenu({ hideComments: true, onToggleComments: jest.fn() });
    expect(screen.queryByText("commentPanel")).toBeNull();
  });

  it("shows version info by default", () => {
    renderMenu({ onOpenVersionDialog: jest.fn() });
    expect(screen.getByText("versionInfo")).toBeTruthy();
  });

  it("hides version info when hideVersionInfo is true", () => {
    renderMenu({ hideVersionInfo: true });
    expect(screen.queryByText("versionInfo")).toBeNull();
  });

  it("disables outline when inlineMergeOpen", () => {
    renderMenu({ inlineMergeOpen: true });
    const item = screen.getByText("outline").closest("li");
    expect(item?.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables outline when sourceMode", () => {
    renderMenu({ sourceMode: true });
    const item = screen.getByText("outline").closest("li");
    expect(item?.getAttribute("aria-disabled")).toBe("true");
  });

  it("renders with commentOpen true for primary color", () => {
    renderMenu({ onToggleComments: jest.fn(), commentOpen: true });
    expect(screen.getByText("commentPanel")).toBeTruthy();
  });

  it("calls onToggleOutline and onClose when outline clicked", () => {
    const { onToggleOutline, onClose } = renderMenu();
    fireEvent.click(screen.getByText("outline"));
    expect(onToggleOutline).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
