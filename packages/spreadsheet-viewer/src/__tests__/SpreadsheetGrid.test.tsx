import { render } from "@testing-library/react";
import React from "react";

import { SpreadsheetGrid } from "../SpreadsheetGrid";
import { createMockAdapter } from "./support/createMockAdapter";

function t(key: string): string {
  return key;
}

describe("SpreadsheetGrid", () => {
  it("adapter から初期データを読み込んで描画する", () => {
    const adapter = createMockAdapter({
      cells: [["h1", "h2"], ["a", "b"]],
      alignments: [[null, null], [null, null]],
      range: { rows: 2, cols: 2 },
    });
    const { container } = render(
      <SpreadsheetGrid adapter={adapter} isDark={false} t={t} />,
    );
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("readOnly Adapter では 適用ボタンが無効化される", () => {
    const adapter = createMockAdapter(
      {
        cells: [["foo"]],
        alignments: [[null]],
        range: { rows: 1, cols: 1 },
      },
      { readOnly: true },
    );
    const { getByRole } = render(
      <SpreadsheetGrid adapter={adapter} isDark={false} t={t} showApply />,
    );
    const applyButton = getByRole("button", { name: "spreadsheetApply" }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });

  it("onDirtyChange / onClose / onUndo / onRedo は省略可能", () => {
    const adapter = createMockAdapter({
      cells: [["x"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    expect(() => {
      render(<SpreadsheetGrid adapter={adapter} isDark={false} t={t} />);
    }).not.toThrow();
  });
});
