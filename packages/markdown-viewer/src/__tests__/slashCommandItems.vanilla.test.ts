/**
 * components-vanilla/slashCommandItems.ts — vanilla スラッシュコマンド既定 items のテスト。
 *
 * G4-B で旧 React 版 extensions/slashCommandItems.ts が削除された際、vanilla 代替が
 * 用意されず slash メニューが全 consumer で空になった退行（e2e 約20件 timeout）の
 * リグレッションテスト。旧 slashCommandItems.test.ts の検証観点を vanilla 仕様で復元する。
 *
 * 検証観点:
 *   1. 既定 items が全コマンド分（34 件）定義されている
 *   2. 必須プロパティ（id/labelKey/iconPath/keywords/action）と id 一意性
 *   3. labelKey が ja/en の i18n リソースに存在する
 *   4. e2e が依存する代表クエリが filterVanillaSlashItems でヒットする
 *   5. 代表 action が editor.chain() の期待メソッドを呼ぶ
 */

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: (locale: string) => [
    { id: "markdown-all", name: "markdownAll", content: `# All ${locale}`, builtin: true },
    { id: "basic-design", name: "basicDesign", content: "# Basic Design", builtin: true },
    { id: "api-spec", name: "apiSpec", content: "# API Spec", builtin: true },
  ],
}));

jest.mock("../constants/defaultContent", () => ({
  getDefaultContent: (locale: string) => `# Welcome ${locale}`,
}));

import { DEFAULT_SLASH_ITEMS } from "../components-vanilla/slashCommandItems";
import { filterVanillaSlashItems } from "../components-vanilla/SlashCommandMenu";
import en from "../i18n/en.json";
import ja from "../i18n/ja.json";

/** t は key をそのまま返す（filter は keywords 側でヒットさせる）。 */
const t = (key: string) => key;

/** chain() の呼び出しを記録する fluent proxy。任意メソッド名を受ける。 */
function createChainEditor() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return chain;
        };
      },
    },
  );
  const editor = { chain: () => chain } as unknown as Parameters<
    (typeof DEFAULT_SLASH_ITEMS)[number]["action"]
  >[0];
  return { editor, calls };
}

describe("DEFAULT_SLASH_ITEMS", () => {
  it("全コマンド分（40 件）が定義されている", () => {
    expect(Array.isArray(DEFAULT_SLASH_ITEMS)).toBe(true);
    expect(DEFAULT_SLASH_ITEMS.length).toBe(40);
  });

  it("必須プロパティが揃い id が一意である", () => {
    const ids = new Set<string>();
    for (const item of DEFAULT_SLASH_ITEMS) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.labelKey).toBe("string");
      expect(
        typeof item.iconPath === "string" ? item.iconPath.length : item.iconPath.length,
      ).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(typeof item.action).toBe("function");
      ids.add(item.id);
    }
    expect(ids.size).toBe(DEFAULT_SLASH_ITEMS.length);
  });

  it("labelKey が ja/en 両方の i18n リソースに存在する", () => {
    const jaEditor = (ja as Record<string, Record<string, string>>).MarkdownEditor;
    const enEditor = (en as Record<string, Record<string, string>>).MarkdownEditor;
    for (const item of DEFAULT_SLASH_ITEMS) {
      expect(jaEditor[item.labelKey]).toBeDefined();
      expect(enEditor[item.labelKey]).toBeDefined();
    }
  });

  it.each([
    ["quote", "blockquote"],
    ["bullet", "bulletList"],
    ["ordered", "orderedList"],
    ["task", "taskList"],
    ["h2", "heading2"],
    ["code", "codeBlock"],
    ["table", "table"],
    ["hr", "horizontalRule"],
    ["embed", "embed"],
    ["mermaid", "mermaid"],
    ["plantuml", "plantuml"],
    ["math", "math"],
    ["toc", "toc"],
    ["date", "date"],
    ["footnote", "footnote"],
    ["note", "admonitionNote"],
    ["tip", "admonitionTip"],
    ["important", "admonitionImportant"],
    ["warning", "admonitionWarning"],
    ["caution", "admonitionCaution"],
    ["html", "html"],
    ["comment", "comment"],
    ["image", "image"],
    ["screenshot", "screenshot"],
    ["frontmatter", "frontmatter"],
    ["gif", "gif"],
    ["welcome", "template-welcome"],
    ["api", "template-api-spec"],
  ])("クエリ %s で %s がヒットする", (query, expectedId) => {
    const hits = filterVanillaSlashItems(DEFAULT_SLASH_ITEMS, query, t);
    expect(hits.map((i) => i.id)).toContain(expectedId);
  });

  it("クエリ template でテンプレート 4 件がヒットする", () => {
    const hits = filterVanillaSlashItems(DEFAULT_SLASH_ITEMS, "template", t);
    expect(hits.map((i) => i.id).sort()).toEqual([
      "template-api-spec",
      "template-basic-design",
      "template-markdown-all",
      "template-welcome",
    ]);
  });

  it.each([
    ["bulletList", "toggleBulletList", []],
    ["orderedList", "toggleOrderedList", []],
    ["taskList", "toggleTaskList", []],
    ["heading2", "setHeading", [{ level: 2 }]],
    ["table", "insertTable", [{ rows: 3, cols: 3, withHeaderRow: true }]],
    ["horizontalRule", "setHorizontalRule", []],
  ] as const)("%s の action が chain().%s を呼ぶ", (id, method, args) => {
    const item = DEFAULT_SLASH_ITEMS.find((i) => i.id === id);
    expect(item).toBeDefined();
    const { editor, calls } = createChainEditor();
    item?.action(editor);
    const call = calls.find((c) => c.method === method);
    expect(call).toBeDefined();
    expect(call?.args).toEqual(args);
    expect(calls.some((c) => c.method === "run")).toBe(true);
  });

  it("mermaid の action が language=mermaid の codeBlock を autoEditOpen で挿入する", () => {
    const item = DEFAULT_SLASH_ITEMS.find((i) => i.id === "mermaid");
    const { editor, calls } = createChainEditor();
    item?.action(editor);
    expect(calls).toContainEqual({ method: "setCodeBlock", args: [{ language: "mermaid" }] });
    expect(calls).toContainEqual({
      method: "updateAttributes",
      args: ["codeBlock", { autoEditOpen: true }],
    });
  });
});
