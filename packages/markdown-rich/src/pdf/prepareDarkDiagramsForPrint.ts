/**
 * ダークモード印刷時に図（Mermaid / PlantUML）をライトテーマへ差し替える戦略の実装。
 *
 * 重量モジュール（mermaid 動的 import / plantuml-encoder）に依存するため markdown-rich 側に置き、
 * markdown-core の usePdfExport へ `DarkDiagramPrintPreparer` として注入する (B-5)。
 */
import {
  buildPlantUmlUrl,
  type DarkDiagramPrintPreparer,
  MERMAID_RENDER_TIMEOUT,
} from "@anytime-markdown/markdown-core";
import plantumlEncoder from "plantuml-encoder";

interface MermaidReplacement {
  innerDiv: HTMLElement;
  lightHtml: string;
  originalHTML: string;
  imgBox: HTMLElement;
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
      const startMatch = /@start(uml|mindmap|wbs|json|yaml)/.exec(code);
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

/**
 * usePdfExport へ注入するダークモード図ライト化戦略。
 * PlantUML は src を差し替えてロードを待ち（delay 前）、Mermaid は print 直前に innerHTML を差し替える。
 */
export const prepareDarkDiagramsForPrint: DarkDiagramPrintPreparer = async () => {
  const plantumlRestores = await replacePlantUmlLight();
  const mermaidReplacements = await prerenderMermaidLight();
  const hasChanges = plantumlRestores.length > 0 || mermaidReplacements.length > 0;
  return {
    hasChanges,
    applyBeforePrint: () => {
      for (const { innerDiv, lightHtml } of mermaidReplacements) {
        innerDiv.innerHTML = lightHtml;
      }
    },
    restore: () => {
      for (const restore of plantumlRestores) restore();
      for (const { imgBox, originalHTML } of mermaidReplacements) {
        imgBox.innerHTML = originalHTML;
      }
    },
  };
};
