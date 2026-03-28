import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "light", setThemeMode: jest.fn() }),
  usePreset: () => ({ presetName: "professional", setPresetName: jest.fn() }),
}));

jest.mock("next/dynamic", () => () => {
  const MockComponent = (props: any) => <div data-testid="editor-page" />;
  MockComponent.displayName = "MockDynamic";
  return MockComponent;
});

import MarkdownViewer from "../app/components/MarkdownViewer";

describe("MarkdownViewer", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    // fetch never resolves
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<MarkdownViewer docKey="test.md" />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows error state on fetch failure", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("fail"));
    render(<MarkdownViewer docKey="test.md" />);
    // Wait for error to appear
    const alert = await screen.findByRole("alert");
    expect(alert).toBeTruthy();
  });

  it("renders editor after successful fetch", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("# Hello"),
    });
    render(<MarkdownViewer docKey="test.md" />);
    const editor = await screen.findByTestId("editor-page");
    expect(editor).toBeTruthy();
  });
});
