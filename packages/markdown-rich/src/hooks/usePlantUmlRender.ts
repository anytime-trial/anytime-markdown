import plantumlEncoder from "plantuml-encoder";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface UsePlantUmlRenderParams {
  code: string;
  isPlantUml: boolean;
  isDark: boolean;
}

export function usePlantUmlRender({ code, isPlantUml, isDark }: UsePlantUmlRenderParams) {
  const [plantUmlUrl, setPlantUmlUrl] = useState(() => {
    if (!isPlantUml || !code.trim()) return "";
    return urlCache.get(cacheKey(code, isDark)) ?? "";
  });
  const [error, setError] = useState("");
  const [plantUmlConsent, setPlantUmlConsent] = useState<"pending" | "accepted" | "rejected">(() => {
    // SSR では sessionStorage が未定義。globalThis は常に定義済みでガードにならない
    if (typeof sessionStorage === "undefined") return "pending";
    const v = sessionStorage.getItem(PLANTUML_CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : "pending";
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isPlantUml || !code.trim() || plantUmlConsent !== "accepted") {
      if (isPlantUml) { setPlantUmlUrl(""); setError(""); }
      return;
    }

    // キャッシュから即座に復元
    const key = cacheKey(code, isDark);
    const cached = urlCache.get(key);
    if (cached) {
      setPlantUmlUrl(cached);
      setError("");
      return;
    }

    const timer = setTimeout(() => {
      try {
        const src = buildPlantUmlSource(code, isDark);
        const encoded = plantumlEncoder.encode(src);
        const url = buildPlantUmlUrl(encoded);
        urlCache.set(key, url);
        if (mountedRef.current) {
          setPlantUmlUrl(url);
          setError("");
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(`PlantUML: ${err instanceof Error ? err.message : "encode error"}`);
          setPlantUmlUrl("");
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [code, isPlantUml, isDark, plantUmlConsent]);

  const handlePlantUmlAccept = useCallback(() => {
    sessionStorage.setItem(PLANTUML_CONSENT_KEY, "accepted");
    setPlantUmlConsent("accepted");
  }, []);

  const handlePlantUmlReject = useCallback(() => {
    sessionStorage.setItem(PLANTUML_CONSENT_KEY, "rejected");
    setPlantUmlConsent("rejected");
  }, []);

  return { plantUmlUrl, error, plantUmlConsent, handlePlantUmlAccept, handlePlantUmlReject, setError };
}
