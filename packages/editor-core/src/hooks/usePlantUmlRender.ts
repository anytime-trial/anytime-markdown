import plantumlEncoder from "plantuml-encoder";
import { useCallback, useEffect, useRef, useState } from "react";

import { BoundedMap } from "../utils/BoundedMap";
import { buildPlantUmlUrl,PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS } from "../utils/plantumlHelpers";

/**
 * モジュールレベルの URL キャッシュ。
 * コンポーネントがアンマウント→再マウントを繰り返しても即座に復元。
 */
const urlCache = new BoundedMap<string, string>(128);
function cacheKey(code: string, isDark: boolean): string {
  return `${code}\0${isDark}`;
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
    if (typeof window === "undefined") return "pending";
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
        const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
        const diagramType = startMatch ? startMatch[1] : null;
        const needsSkinParam = diagramType === "uml" || diagramType === null;
        const lightSkinParam = "skinparam backgroundColor transparent";
        let src: string;
        if (diagramType) {
          if (needsSkinParam && isDark) {
            src = code.replace(/@startuml/, `@startuml\n${PLANTUML_DARK_SKINPARAMS}`);
          } else if (needsSkinParam) {
            src = code.replace(/@startuml/, `@startuml\n${lightSkinParam}`);
          } else {
            src = code;
          }
        } else {
          src = isDark
            ? `@startuml\n${PLANTUML_DARK_SKINPARAMS}\n${code}\n@enduml`
            : `@startuml\n${lightSkinParam}\n${code}\n@enduml`;
        }
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
