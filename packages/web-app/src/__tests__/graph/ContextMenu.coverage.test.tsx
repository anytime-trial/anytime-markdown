import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ContextMenu } from "../../app/graph/components/ContextMenu";

describe("ContextMenu", () => {
  const defaultProps = {
    anchorPosition: { top: 100, left: 200 },
    onAction: jest.fn(),
    onClose: jest.fn(),
    hasClipboard: true,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when anchorPosition is null", () => {
    const { container } = render(
      <ContextMenu {...defaultProps} anchorPosition={null} targetType="node" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders node context menu items", () => {
    render(<ContextMenu {...defaultProps} targetType="node" />);
    expect(screen.getByText("copy")).toBeTruthy();
    expect(screen.getByText("paste")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();
    expect(screen.getByText("bringToFront")).toBeTruthy();
    expect(screen.getByText("sendToBack")).toBeTruthy();
    expect(screen.getByText("group")).toBeTruthy();
    expect(screen.getByText("ungroup")).toBeTruthy();
  });

  it("renders edge context menu with delete only", () => {
    render(<ContextMenu {...defaultProps} targetType="edge" />);
    expect(screen.getByText("delete")).toBeTruthy();
    expect(screen.queryByText("copy")).toBeFalsy();
  });

  it("renders canvas context menu with paste and selectAll", () => {
    render(<ContextMenu {...defaultProps} targetType="canvas" />);
    expect(screen.getByText("paste")).toBeTruthy();
    expect(screen.getByText("selectAll")).toBeTruthy();
  });

  it("calls onAction and onClose when menu item clicked", () => {
    render(<ContextMenu {...defaultProps} targetType="node" />);
    fireEvent.click(screen.getByText("copy"));
    expect(defaultProps.onAction).toHaveBeenCalledWith("copy");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("disables paste when hasClipboard is false", () => {
    render(<ContextMenu {...defaultProps} targetType="canvas" hasClipboard={false} />);
    const pasteItem = screen.getByText("paste").closest("li");
    expect(pasteItem?.classList.toString()).toContain("disabled");
  });

  it("handles all node menu actions", () => {
    render(<ContextMenu {...defaultProps} targetType="node" />);
    const actions = ["copy", "paste", "delete", "bringToFront", "sendToBack", "group", "ungroup"];
    for (const action of actions) {
      fireEvent.click(screen.getByText(action));
    }
    expect(defaultProps.onAction).toHaveBeenCalledTimes(actions.length);
  });

  it("calls onAction for edge delete", () => {
    render(<ContextMenu {...defaultProps} targetType="edge" />);
    fireEvent.click(screen.getByText("delete"));
    expect(defaultProps.onAction).toHaveBeenCalledWith("delete");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onAction for canvas selectAll", () => {
    render(<ContextMenu {...defaultProps} targetType="canvas" />);
    fireEvent.click(screen.getByText("selectAll"));
    expect(defaultProps.onAction).toHaveBeenCalledWith("selectAll");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onAction for canvas paste", () => {
    render(<ContextMenu {...defaultProps} targetType="canvas" hasClipboard={true} />);
    fireEvent.click(screen.getByText("paste"));
    expect(defaultProps.onAction).toHaveBeenCalledWith("paste");
  });
});
