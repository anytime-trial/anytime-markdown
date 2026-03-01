import { useCallback, useEffect, useState } from "react";
import plantumlEncoder from "plantuml-encoder";
import { PLANTUML_SERVER, PLANTUML_CONSENT_KEY, PLANTUML_DARK_SKINPARAMS } from "../utils/plantumlHelpers";

interface UsePlantUmlRenderParams {
  code: string;
  isPlantUml: boolean;
  isDark: boolean;
}

export function usePlantUmlRender({ code, isPlantUml, isDark }: UsePlantUmlRenderParams) {
  const [plantUmlUrl, setPlantUmlUrl] = useState("");
  const [error, setError] = useState("");
  const [plantUmlConsent, setPlantUmlConsent] = useState<"pending" | "accepted" | "rejected">(() => {
    if (typeof window === "undefined") return "pending";
    const v = sessionStorage.getItem(PLANTUML_CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : "pending";
  });

  useEffect(() => {
    if (!isPlantUml || !code.trim() || plantUmlConsent !== "accepted") {
      if (isPlantUml) { setPlantUmlUrl(""); setError(""); }
      return;
    }

    const timer = setTimeout(() => {
      try {
        const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
        const diagramType = startMatch ? startMatch[1] : null;
        const needsSkinParam = diagramType === "uml" || diagramType === null;
        let src: string;
        if (diagramType) {
          src = needsSkinParam && isDark ? code.replace(/@startuml/, `@startuml\n${PLANTUML_DARK_SKINPARAMS}`) : code;
        } else {
          src = isDark ? `@startuml\n${PLANTUML_DARK_SKINPARAMS}\n${code}\n@enduml` : `@startuml\n${code}\n@enduml`;
        }
        const encoded = plantumlEncoder.encode(src);
        setPlantUmlUrl(`${PLANTUML_SERVER}/svg/${encoded}`);
        setError("");
      } catch (err) {
        setError(`PlantUML: ${err instanceof Error ? err.message : "encode error"}`);
        setPlantUmlUrl("");
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
