import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { DatabaseI18nProvider } from "../i18n/context";
import { TableTree } from "../TableTree";

const wrap = (ui: React.ReactNode) =>
  render(<DatabaseI18nProvider locale="ja">{ui}</DatabaseI18nProvider>);

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
