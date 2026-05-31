/**
 * editorExtensions.ts の追加カバレッジテスト
 * getBaseExtensions の返す Extension 配列の詳細テスト。
 */
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("lowlight", () => ({
  createLowlight: () => ({
    register: jest.fn(),
  }),
  common: {},
}));

import { getBaseExtensions } from "../editorExtensions";

describe("getBaseExtensions - additional tests", () => {
  it("returns consistent results on multiple calls", () => {
    const ext1 = getBaseExtensions();
    const ext2 = getBaseExtensions();
    expect(ext1.length).toBe(ext2.length);
  });

  it("includes StarterKit-derived extensions", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    // StarterKit includes paragraph, text, document
    expect(names.length).toBeGreaterThan(5);
  });

  it("includes link extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("link");
  });

  it("includes underline extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("underline");
  });

  it("includes highlight extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("highlight");
  });

  it("includes taskList and taskItem", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("taskList");
    expect(names).toContain("taskItem");
  });

  it("includes table extensions", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    // Should have table-related extensions
    const hasTable = names.some((n: string) => n.toLowerCase().includes("table"));
    expect(hasTable).toBe(true);
  });

  it("includes image extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("image");
  });

  it("includes footnote extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("footnoteRef");
  });

  it("includes markdown extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("markdown");
  });

  it("includes gifBlock extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("gifBlock");
  });

  it("includes headingNumber extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("headingNumber");
  });

  it("includes headingFold extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("headingFold");
  });

  it("includes disableFormattingShortcuts extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("disableFormattingShortcuts");
  });

  it("includes listTextCleanup extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("listTextCleanup");
  });

  it("includes taskListTight extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("taskListTight");
  });

  it("includes codeBlockNavigation extension", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("codeBlockNavigation");
  });

  it("returns different extension count with disableComments=true", () => {
    const withComments = getBaseExtensions();
    const without = getBaseExtensions({ disableComments: true });
    expect(without.length).toBeLessThan(withComments.length);
  });

  it("with disableCheckboxToggle does not crash", () => {
    const extensions = getBaseExtensions({ disableCheckboxToggle: true });
    expect(Array.isArray(extensions)).toBe(true);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it("both options combined work", () => {
    const extensions = getBaseExtensions({ disableComments: true, disableCheckboxToggle: true });
    expect(Array.isArray(extensions)).toBe(true);
  });
});
