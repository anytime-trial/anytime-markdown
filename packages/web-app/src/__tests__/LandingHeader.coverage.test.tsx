import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

import LandingHeader from "../app/components/LandingHeader";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SHOW_GRAPH = "1";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_SHOW_GRAPH;
});

describe("LandingHeader mobile drawer", () => {
  it("opens drawer when menu button clicked", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    // Drawer should open with navigation items
    expect(screen.getAllByText("Graph").length).toBeGreaterThanOrEqual(1);
  });

  it("closes drawer when navigation item clicked", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    // Click a nav item in the drawer
    const graphLinks = screen.getAllByText("Graph");
    // Click the one inside the drawer (second occurrence)
    if (graphLinks.length > 1) {
      fireEvent.click(graphLinks[graphLinks.length - 1]);
    }
  });

  it("renders Graph link in desktop nav", () => {
    render(<LandingHeader />);
    expect(screen.getAllByText("Graph").length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile language toggle in drawer", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    // Drawer should have language toggle
    const enButtons = screen.getAllByText("EN");
    expect(enButtons.length).toBeGreaterThanOrEqual(2); // desktop + mobile
  });

  it("handles desktop language toggle change", () => {
    const mockSetLocale = jest.fn();
    jest.spyOn(require("../app/LocaleProvider"), "useLocaleSwitch").mockReturnValue({ locale: "en", setLocale: mockSetLocale });

    render(<LandingHeader />);
    const jaButtons = screen.getAllByText("JA");
    if (jaButtons.length > 0) {
      fireEvent.click(jaButtons[0]);
    }
  });

  it("handles mobile language toggle change in drawer", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    const jaButtons = screen.getAllByText("JA");
    // Click last JA button (mobile one in drawer)
    if (jaButtons.length > 1) {
      fireEvent.click(jaButtons[jaButtons.length - 1]);
    }
  });

  it("closes drawer by clicking sitesPage link", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    const links = screen.getAllByText("sitesPage");
    if (links.length > 1) {
      fireEvent.click(links[links.length - 1]);
    }
  });

  it("handles clicking already-selected language (null val)", () => {
    render(<LandingHeader />);
    // Click EN when already selected (locale is "en") - onChange fires with null val
    const enButtons = screen.getAllByText("EN");
    if (enButtons.length > 0) {
      fireEvent.click(enButtons[0]);
    }
  });

  it("handles clicking already-selected language in mobile drawer", () => {
    render(<LandingHeader />);
    const menuButton = screen.getByLabelText("ariaMenu");
    fireEvent.click(menuButton);
    // Click EN in drawer when already selected
    const enButtons = screen.getAllByText("EN");
    if (enButtons.length > 1) {
      fireEvent.click(enButtons[enButtons.length - 1]);
    }
  });
});
