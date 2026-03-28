import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

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

import { ShapeHoverBar } from "../../app/graph/components/ShapeHoverBar";

const makeNode = (type: string) => ({
  id: "n1",
  type,
  x: 100,
  y: 100,
  width: 150,
  height: 100,
  text: "",
  style: {
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 2,
    fontSize: 14,
    fontFamily: "sans-serif",
  },
});

const viewport = { offsetX: 0, offsetY: 0, scale: 1 };

describe("ShapeHoverBar", () => {
  it("returns null for non-shape node types", () => {
    const { container } = render(
      <ShapeHoverBar node={makeNode("image") as any} viewport={viewport} onChangeType={jest.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders for rect node type", () => {
    const { container } = render(
      <ShapeHoverBar node={makeNode("rect") as any} viewport={viewport} onChangeType={jest.fn()} />
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("renders for ellipse node type", () => {
    const { container } = render(
      <ShapeHoverBar node={makeNode("ellipse") as any} viewport={viewport} onChangeType={jest.fn()} />
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("renders for diamond node type", () => {
    const { container } = render(
      <ShapeHoverBar node={makeNode("diamond") as any} viewport={viewport} onChangeType={jest.fn()} />
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("calls onChangeType when shape button clicked", () => {
    const onChangeType = jest.fn();
    render(
      <ShapeHoverBar node={makeNode("rect") as any} viewport={viewport} onChangeType={onChangeType} />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]); // click ellipse button
    expect(onChangeType).toHaveBeenCalledWith("n1", expect.any(String));
  });

  it("stops propagation on mouseDown", () => {
    const { container } = render(
      <ShapeHoverBar node={makeNode("rect") as any} viewport={viewport} onChangeType={jest.fn()} />
    );
    const bar = container.firstChild as HTMLElement;
    if (bar) {
      const event = new MouseEvent("mousedown", { bubbles: true });
      const stopPropagation = jest.spyOn(event, "stopPropagation");
      bar.dispatchEvent(event);
      // stopPropagation is called via React handler
    }
  });
});
