import { render } from "@testing-library/react";
import React from "react";

import { SpreadsheetI18nProvider } from "../i18n/context";
import { SpreadsheetGrid } from "../SpreadsheetGrid";
import { createMockAdapter } from "./support/createMockAdapter";

function wrap(ui: React.ReactElement) {
  return render(<SpreadsheetI18nProvider locale="en">{ui}</SpreadsheetI18nProvider>);
}

describe("SpreadsheetGrid", () => {
  it("adapter から初期データを読み込んで描画する", () => {
    const adapter = createMockAdapter({
      cells: [["h1", "h2"], ["a", "b"]],
      alignments: [[null, null], [null, null]],
      range: { rows: 2, cols: 2 },
    });
    const { container } = wrap(<SpreadsheetGrid adapter={adapter} isDark={false} />);
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
    const { getByRole } = wrap(<SpreadsheetGrid adapter={adapter} isDark={false} showApply />);
    const applyButton = getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });

  it("onDirtyChange / onClose / onUndo / onRedo は省略可能", () => {
    const adapter = createMockAdapter({
      cells: [["x"]],
      alignments: [[null]],
      range: { rows: 1, cols: 1 },
    });
    expect(() => {
      wrap(<SpreadsheetGrid adapter={adapter} isDark={false} />);
    }).not.toThrow();
  });
});
