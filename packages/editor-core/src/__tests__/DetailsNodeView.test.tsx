import { render, screen, fireEvent } from "@testing-library/react";
import { DetailsNodeView } from "../DetailsNodeView";

jest.mock("@tiptap/react", () => ({
  NodeViewContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="node-view-content" {...props}>{children}</div>
  ),
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    GlobalStyles: () => null,
  };
});

describe("DetailsNodeView", () => {
  test("初期表示: open=true、aria-expanded=true", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("collapseSection");
  });

  test("初期表示: content に details-expanded クラス", () => {
    render(<DetailsNodeView />);
    const content = screen.getByTestId("node-view-content");
    expect(content.className).toContain("details-expanded");
  });

  test("click → open=false、aria-expanded=false", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("expandSection");
  });

  test("click → content に details-collapsed クラス", () => {
    render(<DetailsNodeView />);
    fireEvent.click(screen.getByRole("button"));
    const content = screen.getByTestId("node-view-content");
    expect(content.className).toContain("details-collapsed");
  });

  test("Enter キー → toggle", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(button, { key: "Enter" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  test("Space キー → toggle", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  test("他のキーでは toggle されない", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Tab" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  test("2回クリック → open=true に戻る", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  test("tabIndex=0 でキーボードフォーカス可能", () => {
    render(<DetailsNodeView />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("tabIndex")).toBe("0");
  });
});
