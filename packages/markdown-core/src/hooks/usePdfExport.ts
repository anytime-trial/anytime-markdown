import { useTheme } from "@mui/material";
import type { Editor } from "@tiptap/react";
import plantumlEncoder from "plantuml-encoder";
import { useCallback, useState } from "react";

import { MERMAID_RENDER_TIMEOUT, PRINT_DELAY } from "../constants/timing";
import { buildPlantUmlUrl } from "../utils/plantumlHelpers";

import type { NotificationKey } from "./useNotification";

interface MermaidReplacement {
  innerDiv: HTMLElement;
  lightHtml: string;
  originalHTML: string;
  imgBox: HTMLElement;
}

/** 折りたたまれたブロックの位置を収集し展開する */
function expandCollapsedBlocks(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.collapsed) positions.push(pos);
  });
  if (positions.length > 0) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", false);
    editor.view.dispatch(tr);
  }
  return positions;
}

/** 折りたたみ状態を復元する */
function restoreCollapsedBlocks(editor: Editor, positions: number[]): void {
  if (positions.length > 0 && !editor.isDestroyed) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", true);
    editor.view.dispatch(tr);
  }
}

/** Mermaid ダイアグラムのライトテーマ SVG を事前レンダリングする */
async function prerenderMermaidLight(): Promise<MermaidReplacement[]> {
  const replacements: MermaidReplacement[] = [];
  const wrappers = document.querySelectorAll<HTMLElement>("[data-node-view-wrapper]");
  try {
    const mermaidMod = await import("mermaid");
    const mermaid = mermaidMod.default;
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "default" });
    let renderIdx = 0;
    for (const wrapper of wrappers) {
      const imgBox = wrapper.querySelector<HTMLElement>("[role='img']");
      const svgEl = imgBox?.querySelector("svg");
      if (!imgBox || !svgEl) continue;
      const code = wrapper.querySelector("code")?.textContent?.trim();
      if (!code) continue;
      try {
        const id = `print-mermaid-${++renderIdx}`;
        const container = document.createElement("div");
        container.id = `d${id}`;
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        document.body.appendChild(container);
        const { svg: lightSvg } = await Promise.race([
          mermaid.render(id, code, container),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("mermaid render timeout")), MERMAID_RENDER_TIMEOUT),
          ),
        ]);
        container.remove();
        const innerDiv = imgBox.querySelector<HTMLElement>(":scope > div")
          || (imgBox.firstElementChild as HTMLElement | null);
        if (innerDiv) {
          replacements.push({
            innerDiv,
            lightHtml: lightSvg,
            originalHTML: imgBox.innerHTML,
            imgBox,
          });
        }
      } catch {
        // レンダリング失敗時はスキップ
      }
    }
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "dark" });
  } catch {
    // mermaid 未ロード時はスキップ
  }
  document.querySelectorAll('[id^="dprint-mermaid-"]').forEach((el) => el.remove());
  return replacements;
}

/** PlantUML ダイアグラムをライトテーマ URL に差し替える */
async function replacePlantUmlLight(): Promise<Array<() => void>> {
  const restores: Array<() => void> = [];
  const pumlImgs = document.querySelectorAll<HTMLImageElement>("[data-node-view-wrapper] img[src*='plantuml']");
  const loadPromises: Promise<void>[] = [];
  for (const img of pumlImgs) {
    const originalSrc = img.src;
    const code = img.closest("[data-node-view-wrapper]")?.querySelector("code")?.textContent?.trim();
    if (!code) continue;
    try {
      const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
      const src = startMatch ? code : `@startuml\n${code}\n@enduml`;
      const encoded = plantumlEncoder.encode(src);
      const newUrl = buildPlantUmlUrl(encoded);
      loadPromises.push(new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = newUrl;
      }));
      restores.push(() => { img.src = originalSrc; });
    } catch {
      // エンコード失敗時はスキップ
    }
  }
  if (loadPromises.length > 0) await Promise.all(loadPromises);
  return restores;
}

interface UsePdfExportParams {
  editor: Editor | null;
  showNotification: (key: NotificationKey) => void;
}

export function usePdfExport({ editor, showNotification }: UsePdfExportParams) {
  const [pdfExporting, setPdfExporting] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const handleExportPdf = useCallback(async () => {
    if (typeof globalThis === "undefined" || !editor) {
      if (typeof globalThis !== "undefined") globalThis.print();
      return;
    }
    setPdfExporting(true);
    try {
    const collapsedPositions = expandCollapsedBlocks(editor);

    // ダークモード時、印刷用にライトテーマで図を差し替え
    const diagramRestores: (() => void)[] = [];
    const pendingMermaidReplacements: MermaidReplacement[] = [];
    if (isDark) {
      pendingMermaidReplacements.push(...await prerenderMermaidLight());
      diagramRestores.push(...await replacePlantUmlLight());
    }

    // 再レンダーを待ってから印刷
    const needsDelay = collapsedPositions.length > 0 || diagramRestores.length > 0 || pendingMermaidReplacements.length > 0;
    const delay = needsDelay ? PRINT_DELAY : 0;
    setTimeout(() => {
      try {
        for (const { innerDiv, lightHtml, originalHTML, imgBox } of pendingMermaidReplacements) {
          innerDiv.innerHTML = lightHtml;
          diagramRestores.push(() => { imgBox.innerHTML = originalHTML; });
        }
        globalThis.print();
      } finally {
        for (const restore of diagramRestores) restore();
        restoreCollapsedBlocks(editor, collapsedPositions);
        setPdfExporting(false);
      }
    }, delay);
    } catch {
      setPdfExporting(false);
      showNotification("pdfExportError");
      return;
    }
    // showNotification は安定な関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isDark]);

  return { pdfExporting, handleExportPdf };
}
