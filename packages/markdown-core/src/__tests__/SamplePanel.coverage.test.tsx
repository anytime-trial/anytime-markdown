/**
 * SamplePanel.tsx - カバレッジテスト
 * Rendering: readOnly, empty samples, toggle open/close, chip click
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SamplePanel } from "../components/SamplePanel";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

const samples = [
  { label: "heading", i18nKey: "sampleHeading", code: "# Heading" },
  { label: "bold", i18nKey: "sampleBold", code: "**bold**" },
];

const t = (key: string) => key;

function renderWithTheme(ui: React.ReactElement, dark = false) {
  return render(
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      {ui}
    </ThemeProvider>
  );
}

describe("SamplePanel coverage", () => {
  it("returns null when readOnly is true", () => {
    const { container } = renderWithTheme(
      <SamplePanel samples={samples} onInsert={jest.fn()} readOnly={true} t={t} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when samples array is empty", () => {
    const { container } = renderWithTheme(
      <SamplePanel samples={[]} onInsert={jest.fn()} readOnly={false} t={t} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders collapsed by default, then expands on click", () => {
    renderWithTheme(
      <SamplePanel samples={samples} onInsert={jest.fn()} readOnly={false} t={t} />
    );

    // Header should be visible
    expect(screen.getByText("sampleContent")).toBeTruthy();
    // Chips should not be visible initially
    expect(screen.queryByText("sampleHeading")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText("sampleContent"));
    expect(screen.getByText("sampleHeading")).toBeTruthy();
    expect(screen.getByText("sampleBold")).toBeTruthy();
  });

  it("calls onInsert when chip is clicked", () => {
    const onInsert = jest.fn();
    renderWithTheme(
      <SamplePanel samples={samples} onInsert={onInsert} readOnly={false} t={t} />
    );

    // Expand
    fireEvent.click(screen.getByText("sampleContent"));

    // Click a chip
    fireEvent.click(screen.getByText("sampleHeading"));
    expect(onInsert).toHaveBeenCalledWith("# Heading");
  });

  it("toggles closed on second click", () => {
    renderWithTheme(
      <SamplePanel samples={samples} onInsert={jest.fn()} readOnly={false} t={t} />
    );

    // Open
    fireEvent.click(screen.getByText("sampleContent"));
    expect(screen.getByText("sampleHeading")).toBeTruthy();

    // Close
    fireEvent.click(screen.getByText("sampleContent"));
    expect(screen.queryByText("sampleHeading")).toBeNull();
  });

  it("renders correctly with dark theme", () => {
    renderWithTheme(
      <SamplePanel samples={samples} onInsert={jest.fn()} readOnly={false} t={t} />,
      true
    );

    expect(screen.getByText("sampleContent")).toBeTruthy();
  });
});
