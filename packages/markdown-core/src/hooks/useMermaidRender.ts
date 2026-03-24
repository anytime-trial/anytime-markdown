import type mermaidAPI from "mermaid";
import { useEffect, useRef, useState } from "react";

import { BoundedMap } from "../utils/BoundedMap";

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
  const first = code.trimStart().split(/[\s{]/)[0].toLowerCase();
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

/**
 * モジュールレベルの SVG キャッシュ。
 * コンポーネントがアンマウント→再マウントを繰り返しても、
 * 既に描画済みの SVG を即座に復元できる。
 * キー: `${code}\0${isDark}`
 */
const svgCache = new BoundedMap<string, string>(64);
function cacheKey(code: string, isDark: boolean): string {
  return `${code}\0${isDark}`;
}

/**
 * モジュールレベルのレンダリング管理。
 * コンポーネントのライフサイクルに依存せず、レンダリングを最後まで完了させる。
 * 結果はキャッシュに保存され、コールバックで通知する。
 */
const pendingRenders = new Map<string, { callbacks: Set<(svg: string, error: string) => void> }>();

function requestMermaidRender(code: string, isDark: boolean, callback: (svg: string, error: string) => void): () => void {
  const key = cacheKey(code, isDark);

  // キャッシュにあれば即座に返す
  const cached = svgCache.get(key);
  if (cached) {
    queueMicrotask(() => callback(cached, ""));
    return () => {};
  }

  // 既にレンダリング中なら、コールバックを追加して結果を待つ
  const pending = pendingRenders.get(key);
  if (pending) {
    pending.callbacks.add(callback);
    return () => { pending.callbacks.delete(callback); };
  }

  // 新規レンダリング開始
  const entry = { callbacks: new Set([callback]) };
  pendingRenders.set(key, entry);

  const timer = setTimeout(async () => {
    try {
      const mermaid = await getMermaid();
      await enqueueRender(async () => {
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
        });

        try {
          await mermaid.parse(code);
        } catch (err) {
          const errorMsg = `Mermaid: ${err instanceof Error ? err.message : "syntax error"}`;
          for (const cb of entry.callbacks) cb("", errorMsg);
          return;
        }

        const id = `mermaid-${++mermaidIdCounter}`;
        const container = document.createElement("div");
        container.id = `d${id}`;
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        document.body.appendChild(container);
        try {
          const { svg: rendered } = await mermaid.render(id, code, container);
          svgCache.set(key, rendered);
          for (const cb of entry.callbacks) cb(rendered, "");
        } finally {
          container.remove();
          document.getElementById(`d${id}`)?.remove();
        }
      });
    } catch (err) {
      const errorMsg = `Mermaid: ${err instanceof Error ? err.message : "render error"}`;
      for (const cb of entry.callbacks) cb("", errorMsg);
    } finally {
      pendingRenders.delete(key);
    }
  }, 500);

  return () => {
    entry.callbacks.delete(callback);
    // 全てのコールバックがキャンセルされたらタイマーも停止
    if (entry.callbacks.size === 0) {
      clearTimeout(timer);
      pendingRenders.delete(key);
    }
  };
}

interface UseMermaidRenderParams {
  code: string;
  isMermaid: boolean;
  isDark: boolean;
}

export function useMermaidRender({ code, isMermaid, isDark }: UseMermaidRenderParams) {
  // キャッシュから初期値を復元（マウント直後にSVGを表示）
  const [svg, setSvg] = useState(() => {
    if (!isMermaid || !code.trim()) return "";
    return svgCache.get(cacheKey(code, isDark)) ?? "";
  });
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isMermaid || !code.trim()) {
      if (isMermaid) { setSvg(""); setError(""); }
      return;
    }

    // キャッシュから即座に復元
    const cached = svgCache.get(cacheKey(code, isDark));
    if (cached) {
      setSvg(cached);
      setError("");
      return;
    }

    // モジュールレベルのレンダリングをリクエスト
    const cancel = requestMermaidRender(code, isDark, (renderedSvg, renderedError) => {
      if (mountedRef.current) {
        setSvg(renderedSvg);
        setError(renderedError);
      }
    });

    return cancel;
  }, [code, isMermaid, isDark]);

  return { svg, error, setError };
}
