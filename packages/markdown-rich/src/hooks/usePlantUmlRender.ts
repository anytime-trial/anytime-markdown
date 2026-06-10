import plantumlEncoder from "plantuml-encoder";

import { BoundedMap } from "../utils/BoundedMap";
import { buildPlantUmlUrl, PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS, PLANTUML_LIGHT_SKINPARAMS } from "@anytime-markdown/markdown-viewer";

/** CSS変数からエディタのフォントを読み取り、手書き風プリセットかを判定 */
function isHandwrittenPreset(): boolean {
  if (typeof document === "undefined") return false;
  const font = document.documentElement.style.getPropertyValue("--editor-content-font-family");
  return font.includes("Klee One");
}

/**
 * モジュールレベルの URL キャッシュ。
 * コンポーネントがアンマウント→再マウントを繰り返しても即座に復元。
 */
const urlCache = new BoundedMap<string, string>(128);
function cacheKey(code: string, isDark: boolean): string {
  return `${code}\0${isDark}\0${isHandwrittenPreset()}`;
}

/** Build the PlantUML source with appropriate skin params applied */
function buildPlantUmlSource(code: string, isDark: boolean): string {
  const startMatch = /@start(uml|mindmap|wbs|json|yaml)/.exec(code);
  const diagramType = startMatch ? startMatch[1] : null;
  const needsSkinParam = diagramType === "uml" || diagramType === null;
  const skinParams = isDark ? PLANTUML_DARK_SKINPARAMS : PLANTUML_LIGHT_SKINPARAMS;
  const handwritten = isHandwrittenPreset() ? "!pragma handwritten true" : "";

  if (diagramType && needsSkinParam) {
    return code.replace(/@startuml/, `@startuml\n${skinParams}\n${handwritten}`);
  }
  if (diagramType) {
    return handwritten ? code.replace(/@start\w+/, `$&\n${handwritten}`) : code;
  }
  return `@startuml\n${skinParams}\n${handwritten}\n${code}\n@enduml`;
}

/**
 * PlantUML ソースを encode し、レンダリングサーバの画像 URL を構築する（React 非依存・同期）。
 * モジュールキャッシュを内包する。encode 失敗時は例外を投げるため呼び出し側で捕捉する。
 * native NodeView（installCodeBlockOverlay）と vanilla dialog の双方から利用する seam。
 */
export function buildPlantUmlImageUrl(code: string, isDark: boolean): string {
  if (!code.trim()) return "";
  const key = cacheKey(code, isDark);
  const cached = urlCache.get(key);
  if (cached) return cached;
  const src = buildPlantUmlSource(code, isDark);
  const encoded = plantumlEncoder.encode(src);
  const url = buildPlantUmlUrl(encoded);
  urlCache.set(key, url);
  return url;
}

/** sessionStorage から PlantUML 同意状態を読み出す（SSR 安全）。 */
export function getPlantUmlConsent(): "pending" | "accepted" | "rejected" {
  if (typeof sessionStorage === "undefined") return "pending";
  const v = sessionStorage.getItem(PLANTUML_CONSENT_KEY);
  return v === "accepted" || v === "rejected" ? v : "pending";
}
