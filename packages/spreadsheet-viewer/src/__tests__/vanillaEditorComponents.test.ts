/**
 * vanilla 版 PaginationBar / SheetTabs / SpreadsheetEditor のユニットテスト。
 * 旧 .tsx テスト（PaginationBar.test.tsx / SheetTabs.test.tsx / SpreadsheetEditor.test.tsx）の
 * 検証項目を DOM 直検証へ移植する。
 */

import { createInMemoryWorkbookAdapter } from "@anytime-markdown/spreadsheet-core";

import { createPaginationBar } from "../vanilla/paginationBar";
import { createSheetTabs } from "../vanilla/sheetTabs";
import { mountSpreadsheetEditor } from "../vanilla/spreadsheetEditor";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createPaginationBar", () => {
  it("ページ表示と総行数を描画する", () => {
    const bar = createPaginationBar(
      { page: 3, pageSize: 50, totalRows: 210, availablePageSizes: [25, 50, 100], onChange: jest.fn() },
      { locale: "ja" },
    );
    document.body.appendChild(bar.el);
    expect(bar.el.textContent).toMatch(/3 \/ 5/);
    expect(bar.el.textContent).toMatch(/210/);
  });

  it("次ページクリックで onChange が呼ばれる", () => {
    const onChange = jest.fn();
    const bar = createPaginationBar(
      { page: 2, pageSize: 50, totalRows: 300, availablePageSizes: [25, 50, 100], onChange },
      { locale: "ja" },
    );
    document.body.appendChild(bar.el);
    const nextBtn = [...bar.el.querySelectorAll("button")].find((b) =>
      /次/.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement;
    nextBtn.click();
    expect(onChange).toHaveBeenCalledWith({ page: 3, pageSize: 50 });
  });

  it("先頭ページでは first/prev が無効・update で内容が切り替わる", () => {
    const props = {
      page: 1,
      pageSize: 50,
      totalRows: 300,
      availablePageSizes: [25, 50, 100],
      onChange: jest.fn(),
    };
    const bar = createPaginationBar(props, { locale: "ja" });
    document.body.appendChild(bar.el);
    const buttons = (): HTMLButtonElement[] => [...bar.el.querySelectorAll("button")];
    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[1].disabled).toBe(true);

    bar.update({ ...props, page: 3 });
    expect(buttons()[0].disabled).toBe(false);
    expect(bar.el.textContent).toMatch(/3 \/ 6/);
  });
});

describe("createSheetTabs", () => {
  const sheets = ["Sheet1", "Sheet2", "Sheet3"];
  const callbacks = () => ({
    onSelect: jest.fn(),
    onAdd: jest.fn(),
    onRemove: jest.fn(),
    onRename: jest.fn(),
    onReorder: jest.fn(),
  });

  it("シート名の表示・クリック選択・追加ボタン", () => {
    const cb = callbacks();
    const tabs = createSheetTabs({ sheets, activeSheet: 0 }, cb, { locale: "ja" });
    document.body.appendChild(tabs.el);
    expect(tabs.el.textContent).toContain("Sheet1");
    expect(tabs.el.textContent).toContain("Sheet3");

    const sheet2 = [...tabs.el.querySelectorAll("div")].find((d) => d.textContent === "Sheet2") as HTMLElement;
    sheet2.click();
    expect(cb.onSelect).toHaveBeenCalledWith(1);

    const addBtn = tabs.el.querySelector('button[aria-label="シートを追加"]') as HTMLButtonElement;
    addBtn.click();
    expect(cb.onAdd).toHaveBeenCalledTimes(1);
    tabs.destroy();
  });

  it("右クリックメニューから削除できる・1 枚のときは disabled", () => {
    const cb = callbacks();
    const tabs = createSheetTabs({ sheets, activeSheet: 0 }, cb, { locale: "ja" });
    document.body.appendChild(tabs.el);
    const sheet2 = [...tabs.el.querySelectorAll("div")].find((d) => d.textContent === "Sheet2") as HTMLElement;
    sheet2.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    const deleteItem = [...document.querySelectorAll('[role="menuitem"]')].find((m) =>
      m.textContent?.includes("シートを削除"),
    ) as HTMLButtonElement;
    expect(deleteItem).toBeTruthy();
    deleteItem.click();
    expect(cb.onRemove).toHaveBeenCalledWith(1);
    tabs.destroy();

    const single = createSheetTabs({ sheets: ["Sheet1"], activeSheet: 0 }, callbacks(), { locale: "ja" });
    document.body.appendChild(single.el);
    const tab = [...single.el.querySelectorAll("div")].find((d) => d.textContent === "Sheet1") as HTMLElement;
    tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    const disabledItem = [...document.querySelectorAll('[role="menuitem"]')].find((m) =>
      m.textContent?.includes("シートを削除"),
    ) as HTMLButtonElement;
    expect(disabledItem.disabled).toBe(true);
    single.destroy();
  });
});

describe("mountSpreadsheetEditor", () => {
  it("日本語ロケールで import/export ボタンを描画する", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const handle = mountSpreadsheetEditor(container, { themeMode: "light", locale: "ja" });
    expect(container.textContent).toContain("CSV を読み込む");
    expect(container.textContent).toContain("CSV をダウンロード");
    expect(container.textContent).toContain("TSV を読み込む");
    expect(container.textContent).toContain("TSV をダウンロード");
    handle.destroy();
    expect(container.querySelector(".sv-root")).toBeNull();
  });

  it("workbookAdapter 指定時はシートタブを描画しタブ操作が adapter に反映される", () => {
    const workbook = createInMemoryWorkbookAdapter();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const handle = mountSpreadsheetEditor(container, { workbookAdapter: workbook, locale: "ja" });

    const addBtn = container.querySelector('button[aria-label="シートを追加"]') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    const before = workbook.getSnapshot().sheets.length;
    addBtn.click();
    expect(workbook.getSnapshot().sheets.length).toBe(before + 1);
    // タブ表示も追従する
    expect(container.textContent).toContain(workbook.getSnapshot().sheets.at(-1)?.name ?? "");
    handle.destroy();
  });

  it("update({themeMode}) でテーマ変数が切り替わる", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const handle = mountSpreadsheetEditor(container, { themeMode: "light", locale: "ja" });
    const root = container.querySelector(".sv-root") as HTMLElement;
    const lightBg = root.style.getPropertyValue("--sv-color-bg-paper");
    handle.update({ themeMode: "dark" });
    expect(root.style.getPropertyValue("--sv-color-bg-paper")).not.toBe(lightBg);
    handle.destroy();
  });

  it("pagination を update で追加・更新・除去できる", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const handle = mountSpreadsheetEditor(container, { locale: "ja", showImportExport: false });
    expect(container.textContent).not.toMatch(/\d+ \/ \d+/);

    handle.update({
      pagination: { page: 1, pageSize: 50, totalRows: 100, availablePageSizes: [50], onChange: jest.fn() },
    });
    expect(container.textContent).toMatch(/1 \/ 2/);

    handle.update({ pagination: null });
    expect(container.textContent).not.toMatch(/1 \/ 2/);
    handle.destroy();
  });
});
