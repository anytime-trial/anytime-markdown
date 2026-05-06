import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";

import { SqlEditorPanel } from "../SqlEditorPanel";

jest.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, vars?: Record<string, string | number>) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messages = require("../i18n/ja.json") as Record<string, Record<string, string>>;
    let value = messages[ns]?.[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value;
  },
}));

const theme = createTheme({ palette: { mode: "light" } });
const wrap = (ui: React.ReactNode) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

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
