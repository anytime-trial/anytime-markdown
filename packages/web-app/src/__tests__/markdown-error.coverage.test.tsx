/**
 * app/markdown/error.tsx のカバレッジテスト
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import MarkdownError from "../app/[locale]/markdown/error";

describe("MarkdownError", () => {
  it("renders error message and retry button", () => {
    const reset = jest.fn();
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<MarkdownError error={new Error("boom")} reset={reset} />);

    expect(screen.getByText("error")).toBeTruthy();
    expect(screen.getByText("retry")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("calls reset when retry button is clicked", () => {
    const reset = jest.fn();
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<MarkdownError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByText("retry"));
    expect(reset).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it("logs error to console", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("test error");
    render(<MarkdownError error={error} reset={jest.fn()} />);

    expect(consoleSpy).toHaveBeenCalledWith("Editor error:", error);
    consoleSpy.mockRestore();
  });
});
