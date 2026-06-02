/**
 * Regression: 比較（マージ）モードで連続画像（README バッジ等）が縦並びになる不具合。
 * 原因は mergeTiptapStyles に画像行 [data-image-row] の flex レイアウト CSS が
 * 欠落していたこと。通常エディタ(blockStyles)と同じ横並びになることを保証する。
 */
import { createTheme } from "@mui/material/styles";

import { getMergeTiptapStyles } from "../components/mergeTiptapStyles";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

describe("getMergeTiptapStyles imageRow layout (regression)", () => {
  it("lays out [data-image-row] horizontally with flex wrap", () => {
    const tiptap = getMergeTiptapStyles(darkTheme)["& .tiptap"] as Record<string, any>;
    const imageRow = tiptap["& [data-image-row]"];
    expect(imageRow).toBeDefined();
    expect(String(imageRow.display)).toContain("flex");
    expect(imageRow.flexWrap).toBe("wrap");
  });

  it("applies the same imageRow layout in light mode", () => {
    const tiptap = getMergeTiptapStyles(lightTheme)["& .tiptap"] as Record<string, any>;
    expect(String(tiptap["& [data-image-row]"].display)).toContain("flex");
  });
});
