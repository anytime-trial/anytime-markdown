/**
 * customHardBreak.ts のカバレッジテスト
 */
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
jest.mock("lowlight", () => ({
  createLowlight: () => ({ register: jest.fn() }),
  common: {},
}));

import { CustomHardBreak } from "../extensions/customHardBreak";

describe("CustomHardBreak", () => {
  it("has name hardBreak", () => {
    expect(CustomHardBreak.name).toBe("hardBreak");
  });

  it("has keyboard shortcuts defined", () => {
    const shortcuts = CustomHardBreak.config.addKeyboardShortcuts;
    expect(shortcuts).toBeTruthy();
  });

  it("has markdown serialize in storage", () => {
    const storage = CustomHardBreak.config.addStorage?.call(CustomHardBreak as any);
    expect(storage?.markdown?.serialize).toBeTruthy();
  });

  it("serialize writes backslash newline for non-table", () => {
    const storage = CustomHardBreak.config.addStorage?.call(CustomHardBreak as any);
    let written = "";
    const state = { write: (s: string) => { written = s; }, inTable: false };
    const node = { type: { name: "hardBreak" } };
    const parent = {
      childCount: 2,
      child: (i: number) => i === 0 ? node : { type: { name: "text" } },
    };
    storage?.markdown?.serialize(state, node, parent, 0);
    expect(written).toBe("\\\n");
  });

  it("serialize writes <br> for table context", () => {
    const storage = CustomHardBreak.config.addStorage?.call(CustomHardBreak as any);
    let written = "";
    const state = { write: (s: string) => { written = s; }, inTable: true };
    const node = { type: { name: "hardBreak" } };
    const parent = {
      childCount: 2,
      child: (i: number) => i === 0 ? node : { type: { name: "text" } },
    };
    storage?.markdown?.serialize(state, node, parent, 0);
    expect(written).toBe("<br>");
  });

  it("serialize does nothing when all remaining children are hardBreak", () => {
    const storage = CustomHardBreak.config.addStorage?.call(CustomHardBreak as any);
    let written = "";
    const state = { write: (s: string) => { written = s; }, inTable: false };
    const nodeType = { name: "hardBreak" };
    const node = { type: nodeType };
    const parent = {
      childCount: 2,
      child: () => ({ type: nodeType }),
    };
    storage?.markdown?.serialize(state, node, parent, 0);
    expect(written).toBe(""); // nothing written
  });
});
