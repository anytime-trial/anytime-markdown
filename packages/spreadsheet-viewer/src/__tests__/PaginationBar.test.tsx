import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";

import { PaginationBar } from "../PaginationBar";

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
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe("PaginationBar", () => {
  it("renders page indicator and total rows", () => {
    wrap(
      <PaginationBar
        page={3}
        pageSize={50}
        totalRows={210}
        availablePageSizes={[25, 50, 100]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/3 \/ 5/)).toBeTruthy();
    expect(screen.getByText(/210/)).toBeTruthy();
  });

  it("calls onChange with next page when next is clicked", () => {
    const onChange = jest.fn();
    wrap(
      <PaginationBar
        page={2}
        pageSize={50}
        totalRows={300}
        availablePageSizes={[25, 50, 100]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/次 ›/));
    expect(onChange).toHaveBeenCalledWith({ page: 3, pageSize: 50 });
  });

  it("disables prev/first on first page", () => {
    wrap(
      <PaginationBar
        page={1}
        pageSize={50}
        totalRows={300}
        availablePageSizes={[25, 50, 100]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/« 先頭/).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText(/‹ 前/).hasAttribute("disabled")).toBe(true);
  });
});
