/**
 * editorExtensions.ts のテスト
 * getBaseExtensions の設定オブジェクト構造を検証
 */

// next-intl をモックして ESM import エラーを回避
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// lowlight モック
jest.mock("lowlight", () => ({
  createLowlight: () => ({
    register: jest.fn(),
  }),
  common: {},
}));

import { getBaseExtensions } from "../editorExtensions";

describe("getBaseExtensions", () => {
  it("returns an array of extensions", () => {
    const extensions = getBaseExtensions();
    expect(Array.isArray(extensions)).toBe(true);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it("includes comment extensions by default", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("commentHighlight");
  });

  it("excludes comment extensions when disableComments is true", () => {
    const extensions = getBaseExtensions({ disableComments: true });
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).not.toContain("commentHighlight");
  });

  it("includes expected core extensions", () => {
    const extensions = getBaseExtensions();
    const names = extensions.map((e: any) => e.name || e.config?.name).filter(Boolean);
    expect(names).toContain("diffHighlight");
    expect(names).toContain("headingFold");
    expect(names).toContain("blockGapCursor");
  });

  it("does not crash with disableCheckboxToggle option", () => {
    const extensions = getBaseExtensions({ disableCheckboxToggle: true });
    expect(Array.isArray(extensions)).toBe(true);
  });
});
