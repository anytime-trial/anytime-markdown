import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";

import { TableTree } from "../TableTree";

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

describe("TableTree", () => {
  it("groups tables and views", () => {
    wrap(
      <TableTree
        schema={{
          tables: [{ name: "users", columns: [] }],
          views: [{ name: "v1", columns: [] }],
        }}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("users")).toBeTruthy();
    expect(screen.getByText("v1")).toBeTruthy();
  });

  it("calls onSelect on click", () => {
    const onSelect = jest.fn();
    wrap(
      <TableTree
        schema={{
          tables: [{ name: "users", columns: [] }],
          views: [],
        }}
        selected={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("users"));
    expect(onSelect).toHaveBeenCalledWith("users");
  });
});
