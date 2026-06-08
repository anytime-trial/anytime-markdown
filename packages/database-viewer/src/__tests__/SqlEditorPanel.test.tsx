import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { DatabaseI18nProvider } from "../i18n/context";
import { SqlEditorPanel } from "../SqlEditorPanel";

const wrap = (ui: React.ReactNode) =>
  render(<DatabaseI18nProvider locale="ja">{ui}</DatabaseI18nProvider>);

describe("SqlEditorPanel", () => {
  it("calls onRun with the entered SQL", async () => {
    const onRun = jest.fn().mockResolvedValue({
      columns: ["a"],
      rows: [["1"]],
      executionTimeMs: 1,
      truncated: false,
    });
    wrap(<SqlEditorPanel onRun={onRun} />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "SELECT 1" } });
    await act(async () => {
      fireEvent.click(screen.getByText("実行"));
    });
    expect(onRun).toHaveBeenCalledWith("SELECT 1");
  });

  it("Run button is disabled when SQL is empty", () => {
    wrap(<SqlEditorPanel onRun={async () => ({ columns: [], rows: [], executionTimeMs: 0, truncated: false })} />);
    const runButton = screen.getByText("実行").closest("button") as HTMLButtonElement;
    expect(runButton.hasAttribute("disabled")).toBe(true);
  });
});
