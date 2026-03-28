import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
}));

import ErrorPage from "../app/error";

describe("ErrorPage", () => {
  it("renders error message and retry button", () => {
    const reset = jest.fn();
    render(<ErrorPage error={new Error("test")} reset={reset} />);
    expect(screen.getByText("error")).toBeTruthy();
    expect(screen.getByText("retry")).toBeTruthy();
  });

  it("calls reset when retry button is clicked", () => {
    const reset = jest.fn();
    render(<ErrorPage error={new Error("test")} reset={reset} />);
    fireEvent.click(screen.getByText("retry"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
