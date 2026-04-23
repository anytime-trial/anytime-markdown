import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { SheetTabs } from "../SheetTabs";

jest.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messages = require("../i18n/ja.json") as Record<string, Record<string, string>>;
    return messages[ns]?.[key] ?? key;
  },
}));

const theme = createTheme({ palette: { mode: "light" } });

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe("SheetTabs", () => {
  const sheets = ["Sheet1", "Sheet2", "Sheet3"];

  it("シート名が表示される", () => {
    wrap(
      <SheetTabs
        sheets={sheets}
        activeSheet={0}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onRename={jest.fn()}
        onReorder={jest.fn()}
      />,
    );
    expect(screen.getByText("Sheet1")).toBeTruthy();
    expect(screen.getByText("Sheet2")).toBeTruthy();
    expect(screen.getByText("Sheet3")).toBeTruthy();
  });

  it("タブをクリックすると onSelect が呼ばれる", () => {
    const onSelect = jest.fn();
    wrap(
      <SheetTabs
        sheets={sheets}
        activeSheet={0}
        onSelect={onSelect}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onRename={jest.fn()}
        onReorder={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Sheet2"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("+ ボタンをクリックすると onAdd が呼ばれる", () => {
    const onAdd = jest.fn();
    wrap(
      <SheetTabs
        sheets={sheets}
        activeSheet={0}
        onSelect={jest.fn()}
        onAdd={onAdd}
        onRemove={jest.fn()}
        onRename={jest.fn()}
        onReorder={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("シートを追加"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("右クリックでコンテキストメニューが表示され、削除できる", () => {
    const onRemove = jest.fn();
    wrap(
      <SheetTabs
        sheets={sheets}
        activeSheet={0}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRemove={onRemove}
        onRename={jest.fn()}
        onReorder={jest.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Sheet2"));
    const deleteBtn = screen.getByText("シートを削除");
    fireEvent.click(deleteBtn);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("シートが1枚のとき削除メニューは disabled", () => {
    wrap(
      <SheetTabs
        sheets={["Sheet1"]}
        activeSheet={0}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onRename={jest.fn()}
        onReorder={jest.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Sheet1"));
    const deleteBtn = screen.getByText("シートを削除");
    expect(deleteBtn.closest("li")?.getAttribute("aria-disabled")).toBe("true");
  });
});
