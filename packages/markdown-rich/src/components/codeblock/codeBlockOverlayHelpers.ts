import type { Editor } from "@anytime-markdown/markdown-core";

import type { CodeBlockKind } from "./CodeBlockBlockContent";

/**
 * `CodeBlockOverlay` の純関数 helper。重量ダイアログ（lowlight 等）を import せず
 * 単体テスト可能にするため、overlay 本体から分離する。
 */

/** ブロック種別とラベル文言を解決する（MermaidNodeView の各 label と一致）。 */
export function codeBlockToolbarLabel(
  kind: CodeBlockKind,
  language: string,
  t: (key: string) => string,
): string {
  switch (kind) {
    case "math": return "Math";
    case "html": return t("htmlPreview");
    case "diagram":
      if (language === "mermaid") return t("mermaid");
      if (language === "anytime-graph") return t("anytimeGraph");
      return t("plantuml");
    case "embed": return "Embed";
    default: return language ? `Code (${language})` : "Code";
  }
}

/**
 * 選択移動に応じて「前ブロックを折畳み・新ブロックを展開」する transaction を適用する。
 * native NodeView は selection 変化で update されないため、overlay が codeCollapsed を駆動する。
 * 属性が実際に変わるときだけ dispatch する（無変化なら command が false を返し no-op）。
 */
export function applySelectionCollapse(editor: Editor, prevPos: number, curPos: number): void {
  const { doc } = editor.state;
  editor
    .chain()
    .command(({ tr }) => {
      let changed = false;
      if (prevPos >= 0 && prevPos < doc.content.size) {
        const pn = doc.nodeAt(prevPos);
        if (pn?.type.name === "codeBlock" && !pn.attrs.codeCollapsed) {
          tr.setNodeAttribute(prevPos, "codeCollapsed", true);
          changed = true;
        }
      }
      if (curPos >= 0) {
        const cn = doc.nodeAt(curPos);
        if (cn?.type.name === "codeBlock" && cn.attrs.codeCollapsed) {
          tr.setNodeAttribute(curPos, "codeCollapsed", false);
          changed = true;
        }
      }
      return changed;
    })
    .run();
}

/** 本文の最初の非空行を返す（embed の URL 抽出）。 */
export function firstNonEmptyLine(text: string): string {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line) return line;
  }
  return "";
}
