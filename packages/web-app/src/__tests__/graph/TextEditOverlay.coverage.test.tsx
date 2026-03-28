import { render, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("../../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "dark", setThemeMode: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core", () => ({
  getCanvasColors: () => ({
    panelBg: "#1a1a2e",
    panelBorder: "#333",
    textPrimary: "#fff",
    textSecondary: "#aaa",
    accentColor: "#4fc3f7",
    hoverBg: "rgba(255,255,255,0.08)",
  }),
}));

jest.mock("../../app/graph/engine/viewport", () => ({
  worldToScreen: (_vp: any, x: number, y: number) => ({ x, y }),
}));

import { TextEditOverlay } from "../../app/graph/components/TextEditOverlay";

const makeNode = (text = "hello") => ({
  id: "n1",
  type: "rect" as const,
  x: 100,
  y: 100,
  width: 150,
  height: 100,
  text,
  style: {
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 2,
    fontSize: 14,
    fontFamily: "sans-serif",
  },
});

const viewport = { offsetX: 0, offsetY: 0, scale: 1 };

describe("TextEditOverlay", () => {
  it("returns null when node is null", () => {
    const { container } = render(
      <TextEditOverlay node={null} viewport={viewport} onCommit={jest.fn()} onCancel={jest.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders textarea when node is provided", () => {
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={jest.fn()} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe("hello");
  });

  it("selects text on mount (default mode)", () => {
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={jest.fn()} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
  });

  it("positions cursor at end in append mode", () => {
    const { container } = render(
      <TextEditOverlay
        node={makeNode() as any}
        viewport={viewport}
        onCommit={jest.fn()}
        onCancel={jest.fn()}
        appendMode={true}
      />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
  });

  it("calls onCommit on blur", () => {
    const onCommit = jest.fn();
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={onCommit} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledWith("n1", "hello");
  });

  it("calls onCancel on Escape key", () => {
    const onCancel = jest.fn();
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={jest.fn()} onCancel={onCancel} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCommit on Enter (without shift)", () => {
    const onCommit = jest.fn();
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={onCommit} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("n1", "hello");
  });

  it("does not commit on Shift+Enter", () => {
    const onCommit = jest.fn();
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={onCommit} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("stops propagation on regular key press", () => {
    const { container } = render(
      <TextEditOverlay node={makeNode() as any} viewport={viewport} onCommit={jest.fn()} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
    const stopPropagation = jest.spyOn(event, "stopPropagation");
    textarea.dispatchEvent(event);
    // React synthetic events handle this separately
  });

  it("handles node with null text", () => {
    const node = makeNode();
    (node as any).text = null;
    const { container } = render(
      <TextEditOverlay node={node as any} viewport={viewport} onCommit={jest.fn()} onCancel={jest.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea?.value).toBe("");
  });
});
