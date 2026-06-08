import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { SpreadsheetI18nProvider } from "../i18n/context";
import { SheetTabs } from "../SheetTabs";

function wrap(ui: React.ReactElement) {
  return render(<SpreadsheetI18nProvider locale="ja">{ui}</SpreadsheetI18nProvider>);
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
    const deleteItem = screen.getByText("シートを削除").closest('[role="menuitem"]');
    expect(deleteItem?.getAttribute("aria-disabled")).toBe("true");
  });
});
