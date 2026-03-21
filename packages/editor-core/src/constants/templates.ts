import apiSpec from "./templates/apiSpec.md";
import basicDesign from "./templates/basicDesign.md";
import markdownAllJa from "./templates/markdownAll.ja.md";
import markdownAllEn from "./templates/markdownAll.en.md";

export interface MarkdownTemplate {
  id: string;
  name: string;
  content: string;
  builtin: boolean;
}

/** 言語に応じたビルトインテンプレート一覧を返す */
export function getBuiltinTemplates(locale: string): MarkdownTemplate[] {
  return [
    {
      id: "markdown-all",
      name: "markdownAll",
      content: locale === "ja" ? markdownAllJa : markdownAllEn,
      builtin: true,
    },
    {
      id: "basic-design",
      name: "basicDesign",
      content: basicDesign,
      builtin: true,
    },
    {
      id: "api-spec",
      name: "apiSpec",
      content: apiSpec,
      builtin: true,
    },
  ];
}

/** 後方互換: 日本語版をデフォルトとしてエクスポート */
export const BUILTIN_TEMPLATES: MarkdownTemplate[] = getBuiltinTemplates("ja");
