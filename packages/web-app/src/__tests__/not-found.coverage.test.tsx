import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

import NotFound from "../app/not-found";

describe("NotFound", () => {
  it("renders 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeTruthy();
  });

  it("renders not found title and link", () => {
    render(<NotFound />);
    expect(screen.getByText("notFoundTitle")).toBeTruthy();
    expect(screen.getByText("notFoundLink")).toBeTruthy();
  });

  it("links to home page", () => {
    render(<NotFound />);
    const link = screen.getByText("notFoundLink").closest("a");
    expect(link?.getAttribute("href")).toBe("/");
  });
});
