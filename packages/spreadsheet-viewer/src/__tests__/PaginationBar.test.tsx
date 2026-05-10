import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";

import { SpreadsheetI18nProvider } from "../i18n/context";
import { PaginationBar } from "../PaginationBar";

const theme = createTheme({ palette: { mode: "light" } });
const wrap = (ui: React.ReactElement) =>
  render(
    <SpreadsheetI18nProvider locale="ja">
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </SpreadsheetI18nProvider>,
  );

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
