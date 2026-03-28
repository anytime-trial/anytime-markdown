/**
 * mergeTiptapStyles.ts coverage tests
 * Targets 12 uncovered branches: showHoverLabels option and isDark variations
 */
import { createTheme } from "@mui/material/styles";

import { getMergeTiptapStyles } from "../components/mergeTiptapStyles";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

describe("getMergeTiptapStyles", () => {
  it("returns styles without showHoverLabels (default)", () => {
    const result = getMergeTiptapStyles(lightTheme);
    expect(result).toBeDefined();
    expect(result["& .tiptap"]).toBeDefined();
  });

  it("returns styles with showHoverLabels=true in light mode", () => {
    const result = getMergeTiptapStyles(lightTheme, 14, 1.6, { showHoverLabels: true });
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    // Should include heading ::before with content
    expect(tiptap["& h1"]).toBeDefined();
    expect((tiptap["& h1"] as any)["&::before"]).toBeDefined();
    expect((tiptap["& h2"] as any)["&::before"]).toBeDefined();
    expect((tiptap["& h3"] as any)["&::before"]).toBeDefined();
    expect((tiptap["& h4"] as any)["&::before"]).toBeDefined();
    expect((tiptap["& h5"] as any)["&::before"]).toBeDefined();
    // Should include li hover labels
    expect((tiptap["& li"] as any)["&::before"]).toBeDefined();
  });

  it("returns styles with showHoverLabels=true in dark mode", () => {
    const result = getMergeTiptapStyles(darkTheme, 16, 1.8, { showHoverLabels: true });
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    expect(tiptap["& h1"]).toBeDefined();
    // Dark mode code styling
    expect(tiptap["& code"]).toBeDefined();
    expect(tiptap["& pre"]).toBeDefined();
  });

  it("returns styles with showHoverLabels=false", () => {
    const result = getMergeTiptapStyles(lightTheme, 14, 1.6, { showHoverLabels: false });
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    // Should NOT include hover labels for p, blockquote etc.
    expect(tiptap["& > p"]).toBeUndefined();
    expect(tiptap["& > blockquote > p"]).toBeUndefined();
  });

  it("uses custom fontSize and lineHeight", () => {
    const result = getMergeTiptapStyles(lightTheme, 18, 2.0);
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    expect((tiptap as any).fontSize).toBe("18px");
    expect((tiptap as any).lineHeight).toBe(2.0);
  });

  it("includes UL/OL/Task hover labels when showHoverLabels is true", () => {
    const result = getMergeTiptapStyles(lightTheme, 14, 1.6, { showHoverLabels: true });
    const tiptap = result["& .tiptap"] as Record<string, unknown>;
    expect(tiptap["& > ul:not([data-type='taskList']) > li"]).toBeDefined();
    expect(tiptap["& > ol > li"]).toBeDefined();
    expect(tiptap["& > ul[data-type='taskList'] > li"]).toBeDefined();
  });
});
