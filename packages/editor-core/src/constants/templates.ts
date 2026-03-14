import { getDefaultContent } from "./defaultContent";
import apiSpec from "./templates/apiSpec.md";
import basicDesign from "./templates/basicDesign.md";

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
      id: "welcome",
      name: "welcome",
      content: getDefaultContent(locale),
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
