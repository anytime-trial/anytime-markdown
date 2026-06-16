/**
 * components-vanilla/FrontmatterCompareRow の回帰テスト。
 *
 * WYSIWYG 比較モードでフロントマターが diff 対象外だった不具合の再発防止。
 * 左=比較ファイル / 右=本ファイルの frontmatter を行差分付きで並置表示する。
 */

import {
  createFrontmatterCompareRow,
  type FrontmatterCompareRowHandle,
} from "../components-vanilla/FrontmatterCompareRow";

const t = (key: string): string => key;

function header(row: FrontmatterCompareRowHandle): HTMLElement {
  return row.el.querySelector<HTMLElement>('[role="button"]')!;
}
function diffBg(row: FrontmatterCompareRowHandle): string {
  return Array.from(row.el.querySelectorAll<HTMLElement>("[data-fm-diff-line]"))
    .map((l) => l.style.backgroundColor)
    .join(" ");
}

describe("createFrontmatterCompareRow", () => {
  it("両方 null なら非表示", () => {
    const row = createFrontmatterCompareRow({ t, compareFrontmatter: null, mainFrontmatter: null });
    expect(row.el.style.display).toBe("none");
    row.destroy();
  });

  it("両方の frontmatter を描画する（左=比較 / 右=本文）", () => {
    const row = createFrontmatterCompareRow({
      t,
      compareFrontmatter: "title: Compare",
      mainFrontmatter: "title: Main",
    });
    expect(row.el.style.display).not.toBe("none");
    expect(row.el.textContent).toContain("Frontmatter");
    expect(row.el.textContent).toContain("title: Compare");
    expect(row.el.textContent).toContain("title: Main");
    row.destroy();
  });

  it("差分行に added/removed の着色が付く", () => {
    const row = createFrontmatterCompareRow({
      t,
      compareFrontmatter: "title: Compare",
      mainFrontmatter: "title: Main",
    });
    expect(diffBg(row)).toMatch(/var\(--am-color-(success|error)-main\)/);
    row.destroy();
  });

  it("ヘッダクリックで本文行の開閉ができる（既定は折りたたみ）", () => {
    const row = createFrontmatterCompareRow({
      t,
      compareFrontmatter: "a: 1",
      mainFrontmatter: "a: 1",
    });
    const body = row.el.querySelector<HTMLElement>("[data-fm-compare-body]")!;
    expect(body.style.display).toBe("none");
    header(row).click();
    expect(body.style.display).not.toBe("none");
    header(row).click();
    expect(body.style.display).toBe("none");
    row.destroy();
  });

  it("update で frontmatter を差し替えられる（null→値で表示・値→null で非表示）", () => {
    const row = createFrontmatterCompareRow({ t, compareFrontmatter: null, mainFrontmatter: null });
    expect(row.el.style.display).toBe("none");

    row.update({ compareFrontmatter: "x: 1", mainFrontmatter: "x: 2" });
    expect(row.el.style.display).not.toBe("none");
    expect(row.el.textContent).toContain("x: 1");
    expect(row.el.textContent).toContain("x: 2");

    row.update({ compareFrontmatter: null, mainFrontmatter: null });
    expect(row.el.style.display).toBe("none");
    row.destroy();
  });

  it("片側のみ frontmatter があっても表示する", () => {
    const row = createFrontmatterCompareRow({
      t,
      compareFrontmatter: null,
      mainFrontmatter: "only: main",
    });
    expect(row.el.style.display).not.toBe("none");
    expect(row.el.textContent).toContain("only: main");
    row.destroy();
  });

  it("update({hidden}) で内容を保ったまま表示/非表示を切り替える", () => {
    const row = createFrontmatterCompareRow({
      t,
      compareFrontmatter: "a: 1",
      mainFrontmatter: "a: 2",
    });
    expect(row.el.style.display).not.toBe("none");
    row.update({ hidden: true });
    expect(row.el.style.display).toBe("none");
    // 内容は保持されている（再表示で再構築不要）。
    expect(row.el.textContent).toContain("a: 1");
    row.update({ hidden: false });
    expect(row.el.style.display).not.toBe("none");
    row.destroy();
  });

  it("a11y: ヘッダの aria-controls が本文 id を指す", () => {
    const row = createFrontmatterCompareRow({ t, compareFrontmatter: "a: 1", mainFrontmatter: "a: 1" });
    const h = header(row);
    const body = row.el.querySelector<HTMLElement>("[data-fm-compare-body]")!;
    expect(body.id).not.toBe("");
    expect(h.getAttribute("aria-controls")).toBe(body.id);
    row.destroy();
  });
});
