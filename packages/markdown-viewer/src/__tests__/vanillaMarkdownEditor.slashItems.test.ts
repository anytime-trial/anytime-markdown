/**
 * host/vanillaMarkdownEditor.ts — slash items 既定供給のリグレッションテスト。
 *
 * G4-B 退行の本体: host は slashItems 注入 seam（current.slashItems ?? []）を持つが
 * どの consumer も注入しておらず、vanilla 経路（web-app / VS Code webview）で
 * スラッシュメニューが常に「No matching commands」になった。
 * 本テストは「注入が無くても既定 items が menu へ渡る」契約を encode する。
 *
 * createSlashCommandMenu を spy 化して host が渡す items を記録する
 * （メニュー描画自体は vanillaChrome.SlashCommandMenu.test.ts が担当）。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

// createSlashCommandMenu を spy 化（実装はそのまま使い、host が渡す opts を記録する）。
const slashMenuSpy = jest.fn();
jest.mock("../components-vanilla/SlashCommandMenu", () => {
  const actual = jest.requireActual("../components-vanilla/SlashCommandMenu");
  return {
    ...actual,
    createSlashCommandMenu: (opts: unknown) => {
      slashMenuSpy(opts);
      return actual.createSlashCommandMenu(opts);
    },
  };
});

import type { VanillaSlashCommandItem } from "../components-vanilla/SlashCommandMenu";
import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

describe("mountVanillaMarkdownEditor slash items 既定供給", () => {
  let container: HTMLElement;

  beforeEach(() => {
    slashMenuSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("slashItems 未指定でも既定 items（全コマンド）が menu へ渡る", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    expect(slashMenuSpy).toHaveBeenCalledTimes(1);
    const opts = slashMenuSpy.mock.calls[0][0] as { items: readonly VanillaSlashCommandItem[] };
    const ids = opts.items.map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    expect(ids).toContain("blockquote");
    expect(ids).toContain("heading2");
    expect(ids).toContain("template-welcome");
    handle.destroy();
  });

  it("slashItems を明示注入した場合は注入値が優先される", () => {
    const custom: VanillaSlashCommandItem[] = [
      { id: "x", labelKey: "slashH1", iconPath: "M0 0h24v24H0z", keywords: ["x"], action: () => {} },
    ];
    const handle = mountVanillaMarkdownEditor(container, { t, slashItems: custom });
    const opts = slashMenuSpy.mock.calls[0][0] as { items: readonly VanillaSlashCommandItem[] };
    expect(opts.items.map((i) => i.id)).toEqual(["x"]);
    handle.destroy();
  });
});
