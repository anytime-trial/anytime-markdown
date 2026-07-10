import DOMPurify from "dompurify";
import type mermaidAPI from "mermaid";

import { BoundedMap } from "../utils/BoundedMap";

/** CSS変数からエディタのフォントを読み取り、手書き風プリセットかを判定 */
function isHandwrittenPreset(): boolean {
  if (typeof document === "undefined") return false;
  const font = document.documentElement.style.getPropertyValue("--editor-content-font-family");
  return font.includes("Klee One");
}

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

/** Mermaid レンダリングを直列化するキュー（並行実行による DOM 競合・initialize 競合を防止） */
let renderQueue: Promise<void> = Promise.resolve();
export function enqueueRender<T>(fn: () => Promise<T>): Promise<T> {
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
  // DOMPurify の既定 HTML integration point は annotation-xml のみ。foreignobject を
  // 足さないと SVG→HTML の名前空間切替が不正扱いになり、mermaid のノードラベル
  // （foreignObject 内の div/span/p）が全削除されて図から文字が消える。
  HTML_INTEGRATION_POINTS: { "annotation-xml": true, foreignobject: true },
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
function cacheKey(code: string, isDark: boolean, handDrawn: boolean = isHandwrittenPreset()): string {
  return `${code}\0${isDark}\0${handDrawn}`;
}

/**
 * キャッシュ済み Mermaid SVG を同期取得する（未キャッシュは空文字）。
 * native NodeView がマウント直後に SVG を即時表示するための seam。
 */
export function getCachedMermaidSvg(code: string, isDark: boolean): string {
  if (!code.trim()) return "";
  return svgCache.get(cacheKey(code, isDark)) ?? "";
}

/**
 * モジュールレベルのレンダリング管理。
 * コンポーネントのライフサイクルに依存せず、レンダリングを最後まで完了させる。
 * 結果はキャッシュに保存され、コールバックで通知する。
 */
const pendingRenders = new Map<string, { callbacks: Set<(svg: string, error: string) => void> }>();

/**
 * Mermaid を SVG へレンダリングし、結果をコールバックで通知する。
 * モジュールレベルのキャッシュ・直列化キュー・500ms デバウンスを内包し、
 * React に依存しない。戻り値はキャンセル関数。
 * native NodeView（installCodeBlockOverlay）と vanilla dialog の双方から利用する seam。
 */
export function requestMermaidRender(code: string, isDark: boolean, callback: (svg: string, error: string) => void): () => void {
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
        const handDrawn = isHandwrittenPreset();
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          look: handDrawn ? "handDrawn" : "classic",
          ...(handDrawn ? { fontFamily: '"Caveat", "Klee One", cursive', handDrawnSeed: 42 } : {}),
          theme: isDark ? "dark" : "base",
          themeVariables: isDark ? undefined : {
            primaryColor: "#F5F5F0",
            primaryBorderColor: "#888888",
            primaryTextColor: "#1A1A1A",
            secondaryColor: "#EAEAE5",
            secondaryBorderColor: "#999999",
            secondaryTextColor: "#1A1A1A",
            tertiaryColor: "#E0E0DB",
            tertiaryBorderColor: "#AAAAAA",
            tertiaryTextColor: "#1A1A1A",
            lineColor: "#555555",
            textColor: "#1A1A1A",
            mainBkg: "#F5F5F0",
            nodeBorder: "#888888",
            clusterBkg: "#EAEAE5",
            clusterBorder: "#999999",
            titleColor: "#1A1A1A",
            edgeLabelBackground: "#E8E6E1",
          },
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
        container.style.fontSize = "16px";
        document.body.appendChild(container);
        try {
          const { svg: rendered } = await mermaid.render(id, code, container);
          // mermaid 出力 SVG を追加サニタイズ（foreignObject 経由 XSS の二重防御）
          const sanitized = DOMPurify.sanitize(rendered, SVG_SANITIZE_CONFIG);
          // 実際に描画したプリセット(handDrawn)でキーを確定し、500ms デバウンス中の
          // プリセット変更による別キーへのキャッシュ汚染を防ぐ
          svgCache.set(cacheKey(code, isDark, handDrawn), sanitized);
          for (const cb of entry.callbacks) cb(sanitized, "");
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
