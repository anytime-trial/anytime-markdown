/**
 * templates 定数のユニットテスト
 */

jest.mock("../constants/templates/markdownAll.ja.md", () => "# 日本語マークダウン", { virtual: true });
jest.mock("../constants/templates/markdownAll.en.md", () => "# English Markdown", { virtual: true });
jest.mock("../constants/templates/basicDesign.md", () => "# Basic Design", { virtual: true });
jest.mock("../constants/templates/apiSpec.md", () => "# API Spec", { virtual: true });

import { getBuiltinTemplates, BUILTIN_TEMPLATES } from "../constants/templates";

describe("getBuiltinTemplates", () => {
  it("日本語テンプレートを返す", () => {
    const templates = getBuiltinTemplates("ja");
    expect(templates.length).toBeGreaterThanOrEqual(3);
    templates.forEach(t => {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.content).toBeTruthy();
      expect(t.builtin).toBe(true);
    });
  });

  it("英語テンプレートを返す", () => {
    const templates = getBuiltinTemplates("en");
    expect(templates.length).toBeGreaterThanOrEqual(3);
  });

  it("markdown-all テンプレートが言語で異なる", () => {
    const ja = getBuiltinTemplates("ja").find(t => t.id === "markdown-all");
    const en = getBuiltinTemplates("en").find(t => t.id === "markdown-all");
    expect(ja).toBeDefined();
    expect(en).toBeDefined();
    expect(ja!.content).not.toBe(en!.content);
  });

  it("basic-design と api-spec は言語非依存", () => {
    const ja = getBuiltinTemplates("ja");
    const en = getBuiltinTemplates("en");
    const jaDesign = ja.find(t => t.id === "basic-design");
    const enDesign = en.find(t => t.id === "basic-design");
    expect(jaDesign!.content).toBe(enDesign!.content);
  });
});

describe("BUILTIN_TEMPLATES", () => {
  it("日本語版のデフォルトエクスポート", () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(BUILTIN_TEMPLATES).toEqual(getBuiltinTemplates("ja"));
  });
});
