import { useEffect, useState } from "react";
import type mermaidAPI from "mermaid";

/** Lazy-load mermaid (~1.5 MB) only when needed */
let mermaidInstance: typeof mermaidAPI | null = null;
async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import("mermaid");
    mermaidInstance = mod.default;
  }
  return mermaidInstance;
}

let mermaidIdCounter = 0;

/** Mermaid レンダリングを直列化するキュー（並行実行による DOM 競合を防止） */
let renderQueue: Promise<void> = Promise.resolve();
function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
  const task = renderQueue.then(fn, fn);
  renderQueue = task.then(() => {}, () => {});
  return task;
}

/** Mermaid SVG用のDOMPurify設定: foreignObject経由のXSSを防止 */
export const SVG_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["foreignObject"] as string[],
  ADD_ATTR: ["xmlns", "style", "class", "requiredExtensions"] as string[],
  FORBID_TAGS: ["script", "iframe", "object", "embed"] as string[],
};

/** Detect Mermaid diagram type from code content for aria-label */
export function detectMermaidType(code: string): string {
  const first = code.trimStart().split(/[\s\n{]/)[0].toLowerCase();
  if (first === "graph" || first === "flowchart") return "diagramFlowchart";
  if (first === "sequencediagram") return "diagramSequence";
  if (first === "classdiagram") return "diagramClass";
  if (first === "statediagram" || first === "statediagram-v2") return "diagramState";
  if (first === "erdiagram") return "diagramEr";
  if (first === "gantt") return "diagramGantt";
  if (first === "pie") return "diagramPie";
  if (first === "mindmap") return "diagramMindmap";
  return "diagramGeneric";
}

interface UseMermaidRenderParams {
  code: string;
  isMermaid: boolean;
  isDark: boolean;
}

export function useMermaidRender({ code, isMermaid, isDark }: UseMermaidRenderParams) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isMermaid || !code.trim()) {
      if (isMermaid) { setSvg(""); setError(""); }
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const mermaid = await getMermaid();
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: isDark ? "dark" : "default",
        securityLevel: "strict",
      });

      try {
        await mermaid.parse(code);
      } catch (err) {
        if (!cancelled) { setError(`Mermaid: ${err instanceof Error ? err.message : "syntax error"}`); setSvg(""); }
        return;
      }

      if (cancelled) return;
      try {
        await enqueueRender(async () => {
          if (cancelled) return;
          const id = `mermaid-${++mermaidIdCounter}`;
          const container = document.createElement("div");
          container.id = `d${id}`;
          container.style.position = "absolute";
          container.style.left = "-9999px";
          container.style.top = "-9999px";
          document.body.appendChild(container);
          try {
            const { svg: rendered } = await mermaid.render(id, code, container);
            if (!cancelled) { setSvg(rendered); setError(""); }
          } finally {
            container.remove();
            document.getElementById(`d${id}`)?.remove();
          }
        });
      } catch (err) {
        if (!cancelled) { setError(`Mermaid: ${err instanceof Error ? err.message : "render error"}`); setSvg(""); }
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [code, isMermaid, isDark]);

  return { svg, error, setError };
}
