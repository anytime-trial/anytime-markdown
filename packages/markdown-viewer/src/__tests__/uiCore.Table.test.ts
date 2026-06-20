/**
 * createTable（@anytime-markdown/ui-core/Table）の jsdom ユニットテスト。
 *
 * 素 DOM の `<table>` ファクトリ。列定義 + 行データから thead/tbody を構築し、
 * テーマ色は `--am-color-*` CSS 変数で追従する。controller 形（update / destroy）。
 * ui-core の実体に対し jsdom（DOM）が必要なため markdown-viewer 側に置く
 * （他の uiCore.*.test.ts と同じ配置）。
 */
import {
  createTable,
  type TableColumn,
} from "@anytime-markdown/ui-core/Table";

const columns: ReadonlyArray<TableColumn> = [
  { key: "name", header: "Name" },
  { key: "count", header: "Count", align: "right" },
];

describe("ui-core/Table", () => {
  it("renders a table with header cells from columns", () => {
    const { el } = createTable({ columns, rows: [] });
    expect(el.tagName).toBe("TABLE");
    const headers = Array.from(el.querySelectorAll("thead th"));
    expect(headers.map((h) => h.textContent)).toEqual(["Name", "Count"]);
  });

  it("renders one row per data item with cells in column order", () => {
    const { el } = createTable({
      columns,
      rows: [
        { name: "alpha", count: "3" },
        { name: "beta", count: "7" },
      ],
    });
    const bodyRows = el.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(2);
    const firstCells = Array.from(bodyRows[0].querySelectorAll("td")).map(
      (c) => c.textContent,
    );
    expect(firstCells).toEqual(["alpha", "3"]);
  });

  it("renders empty string for missing keys", () => {
    const { el } = createTable({ columns, rows: [{ name: "only" }] });
    const cells = Array.from(el.querySelectorAll("tbody td")).map(
      (c) => c.textContent,
    );
    expect(cells).toEqual(["only", ""]);
  });

  it("applies column alignment to header and body cells", () => {
    const { el } = createTable({
      columns,
      rows: [{ name: "a", count: "1" }],
    });
    const th = el.querySelectorAll("thead th");
    expect((th[1] as HTMLElement).style.textAlign).toBe("right");
    const td = el.querySelectorAll("tbody td");
    expect((td[1] as HTMLElement).style.textAlign).toBe("right");
  });

  it("update() replaces the body rows", () => {
    const ctrl = createTable({ columns, rows: [{ name: "a", count: "1" }] });
    ctrl.update([
      { name: "x", count: "9" },
      { name: "y", count: "8" },
    ]);
    const bodyRows = ctrl.el.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(2);
    expect(bodyRows[0].querySelector("td")?.textContent).toBe("x");
    // header is preserved across update
    expect(ctrl.el.querySelectorAll("thead th").length).toBe(2);
  });

  it("destroy() removes the element from its parent", () => {
    const ctrl = createTable({ columns, rows: [] });
    document.body.appendChild(ctrl.el);
    expect(document.body.contains(ctrl.el)).toBe(true);
    ctrl.destroy();
    expect(document.body.contains(ctrl.el)).toBe(false);
  });

  it("applies small size padding and font to header and body cells", () => {
    const { el } = createTable({
      columns,
      rows: [{ name: "a", count: "1" }],
      size: "small",
    });
    const th = el.querySelector("thead th") as HTMLElement;
    expect(th.style.cssText).toContain("6px 8px");
    expect(th.style.cssText).toContain("0.8125rem");
    const td = el.querySelector("tbody td") as HTMLElement;
    expect(td.style.cssText).toContain("6px 8px");
    expect(td.style.cssText).toContain("0.8125rem");
  });

  it("uses theme CSS variables for colors", () => {
    const { el } = createTable({ columns, rows: [{ name: "a", count: "1" }] });
    const th = el.querySelector("thead th") as HTMLElement;
    expect(th.style.cssText).toContain("--am-color-");
    const td = el.querySelector("tbody td") as HTMLElement;
    expect(td.style.cssText).toContain("--am-color-divider");
  });
});
