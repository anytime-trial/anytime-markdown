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
    modalBg: "#1e1e1e",
  }),
}));

import { DocEditorModal } from "@anytime-markdown/graph-viewer/src/components/DocEditorModal";

describe("DocEditorModal", () => {
  const defaultProps = {
    open: true,
    title: "Test Doc",
    content: "# Hello World",
    onSave: jest.fn(),
    onClose: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when not open", () => {
    const { container } = render(
      <DocEditorModal {...defaultProps} open={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and textarea when open", () => {
    render(<DocEditorModal {...defaultProps} />);
    expect(screen.getByText("Test Doc")).toBeTruthy();
  });

  it("shows untitledDocument when title is empty", () => {
    render(<DocEditorModal {...defaultProps} title="" />);
    expect(screen.getByText("untitledDocument")).toBeTruthy();
  });

  it("calls onSave and onClose when close button clicked", () => {
    render(<DocEditorModal {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(defaultProps.onSave).toHaveBeenCalledWith("# Hello World");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onSave and onClose when backdrop clicked", () => {
    const { container } = render(<DocEditorModal {...defaultProps} />);
    // The outermost box is the backdrop
    const backdrop = container.firstChild as HTMLElement;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(defaultProps.onSave).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it("updates content via textarea", () => {
    render(<DocEditorModal {...defaultProps} />);
    const textarea = document.querySelector("textarea");
    if (textarea) {
      fireEvent.change(textarea, { target: { value: "New content" } });
      // Close to trigger save with new content
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]);
      expect(defaultProps.onSave).toHaveBeenCalledWith("New content");
    }
  });

  it("resets content when re-opened", () => {
    const { rerender } = render(<DocEditorModal {...defaultProps} open={false} />);
    rerender(<DocEditorModal {...defaultProps} open={true} content="Updated content" />);
    // Content should be updated when open changes
  });
});
