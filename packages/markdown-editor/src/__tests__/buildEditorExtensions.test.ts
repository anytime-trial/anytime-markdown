/**
 * buildEditorExtensions のユニットテスト。
 *
 * 左右エディタ（main / compare）の拡張構成を単一ファクトリから導出する責務を検証する。
 * 比較ビュー左パネルで codeBlockExtension が伝播せず mermaid/math/html/embed が
 * 描画されなかった不具合の回帰防止を主目的とする。
 *
 * lowlight(ESM) の取り込みを避けるため editorExtensions と各拡張はモックする。
 */

// getBaseExtensions は受け取った codeBlockExtension を出力へ含める実装を模す
// （実体の editorExtensions.ts:290 と同じく codeBlockExtension をそのまま配置する挙動）。
const getBaseExtensionsMock = jest.fn((opts?: { codeBlockExtension?: { name: string } }) => [
  { name: "baseStub" },
  ...(opts?.codeBlockExtension ? [opts.codeBlockExtension] : []),
]);

jest.mock("../editorExtensions", () => ({
  getBaseExtensions: (opts?: { codeBlockExtension?: { name: string } }) => getBaseExtensionsMock(opts),
}));

jest.mock("@anytime-markdown/markdown-extension-placeholder", () => ({
  __esModule: true,
  default: { configure: jest.fn().mockReturnValue({ name: "placeholder" }) },
}));

jest.mock("../extensions/customHardBreak", () => ({ CustomHardBreak: { name: "customHardBreak" } }));
jest.mock("../extensions/deleteLineExtension", () => ({ DeleteLineExtension: { name: "deleteLine" } }));
jest.mock("../searchReplaceExtension", () => ({ SearchReplaceExtension: { name: "searchReplace" } }));
jest.mock("../extensions/reviewModeExtension", () => ({ ReviewModeExtension: { name: "reviewMode" } }));
jest.mock("../extensions/changeGutterExtension", () => ({ ChangeGutterExtension: { name: "changeGutter" } }));
jest.mock("../extensions/slashCommandExtension", () => ({
  SlashCommandExtension: { configure: jest.fn().mockReturnValue({ name: "slashCommand" }) },
}));

import type { AnyExtension } from "@anytime-markdown/markdown-core";

import { buildEditorExtensions } from "../buildEditorExtensions";

const sentinelCodeBlock = { name: "sentinelCodeBlock" } as unknown as AnyExtension;

describe("buildEditorExtensions", () => {
  beforeEach(() => getBaseExtensionsMock.mockClear());

  test("compare モードで codeBlockExtension が getBaseExtensions へ伝播し出力に含まれる（左パネル描画の回帰防止）", () => {
    const exts = buildEditorExtensions({ mode: "compare", codeBlockExtension: sentinelCodeBlock });
    expect(getBaseExtensionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ codeBlockExtension: sentinelCodeBlock, disableComments: true, disableCheckboxToggle: true }),
    );
    expect(exts).toContain(sentinelCodeBlock);
  });

  test("compare モードは編集系拡張を含まず read-only 用の構成になる", () => {
    const names = buildEditorExtensions({ mode: "compare" }).map((e) => (e as { name: string }).name);
    expect(names).not.toContain("slashCommand");
    expect(names).not.toContain("deleteLine");
    expect(names).not.toContain("searchReplace");
    expect(names).not.toContain("changeGutter");
    expect(names).toContain("reviewMode");
  });

  test("main モードは codeBlockExtension と編集系拡張の両方を含む", () => {
    const exts = buildEditorExtensions({ mode: "main", codeBlockExtension: sentinelCodeBlock });
    const names = exts.map((e) => (e as { name: string }).name);
    expect(getBaseExtensionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ codeBlockExtension: sentinelCodeBlock, disableComments: false, disableCheckboxToggle: false }),
    );
    expect(exts).toContain(sentinelCodeBlock);
    expect(names).toEqual(expect.arrayContaining(["slashCommand", "deleteLine", "searchReplace", "changeGutter", "reviewMode"]));
  });

  test("main モードは placeholder / onSlashStateChange を各拡張へ渡す", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Placeholder = require("@anytime-markdown/markdown-extension-placeholder").default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SlashCommandExtension } = require("../extensions/slashCommandExtension");
    buildEditorExtensions({ mode: "main", placeholder: "PH", onSlashStateChange: () => undefined });
    expect(Placeholder.configure).toHaveBeenCalledWith({ placeholder: "PH" });
    expect(SlashCommandExtension.configure).toHaveBeenCalledWith(
      expect.objectContaining({ onStateChange: expect.any(Function) }),
    );
  });
});
