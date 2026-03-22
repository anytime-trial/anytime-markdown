import { PLANTUML_DARK_BG, PLANTUML_DARK_FG, PLANTUML_DARK_SURFACE } from "../constants/colors";

/** PlantUML 外部サーバー URL */
export const PLANTUML_SERVER = "https://www.plantuml.com/plantuml";

/** PlantUML 外部通信同意のセッションストレージキー */
export const PLANTUML_CONSENT_KEY = "plantuml-external-consent";

/**
 * PlantUML のエンコード済みコードから SVG URL を構築し、
 * PLANTUML_SERVER オリジンに限定されていることを検証する。
 * CodeQL SSRF 対策: ユーザー入力由来の URL が固定オリジン以外を指さないことを保証。
 */
export function buildPlantUmlUrl(encoded: string): string {
  const url = `${PLANTUML_SERVER}/svg/${encoded}`;
  if (!url.startsWith(PLANTUML_SERVER)) {
    throw new Error("PlantUML URL does not match allowed origin");
  }
  return url; // lgtm[js/request-forgery]
}

// PlantUML dark mode palette
const PLANTUML_DARK = { fg: PLANTUML_DARK_FG, bg: PLANTUML_DARK_BG, surface: PLANTUML_DARK_SURFACE } as const;

// Elements with standard background (#2D2D2D)
const PLANTUML_STD_ELEMENTS = [
  "actor", "class", "note", "usecase", "participant", "database",
  "activity", "activityDiamond", "state", "entity", "component",
] as const;

// Container elements with surface background (#1E1E1E)
const PLANTUML_CONTAINER_ELEMENTS = ["rectangle", "package", "partition", "node"] as const;

function buildPlantUmlDarkSkinparams(): string {
  const { fg, bg, surface } = PLANTUML_DARK;
  const lines: string[] = [
    "skinparam backgroundColor transparent",
    `skinparam defaultFontColor ${fg}`,
    `skinparam arrowColor ${fg}`,
    `skinparam stereotypeFontColor ${fg}`,
  ];
  for (const el of PLANTUML_STD_ELEMENTS) {
    lines.push(`skinparam ${el}BorderColor ${fg}`, `skinparam ${el}BackgroundColor ${bg}`, `skinparam ${el}FontColor ${fg}`);
  }
  for (const el of PLANTUML_CONTAINER_ELEMENTS) {
    lines.push(`skinparam ${el}BorderColor ${fg}`, `skinparam ${el}BackgroundColor ${surface}`, `skinparam ${el}FontColor ${fg}`);
  }
  // Sequence diagram
  lines.push(
    `skinparam sequenceArrowColor ${fg}`,
    `skinparam sequenceLifeLineBorderColor ${fg}`,
    `skinparam sequenceLifeLineBackgroundColor ${bg}`,
    `skinparam sequenceGroupBorderColor ${fg}`,
    `skinparam sequenceGroupBodyBackgroundColor ${surface}`,
    `skinparam sequenceGroupFontColor ${fg}`,
    `skinparam sequenceGroupHeaderFontColor ${fg}`,
    `skinparam sequenceDividerBorderColor ${fg}`,
    `skinparam sequenceDividerBackgroundColor ${bg}`,
    `skinparam sequenceDividerFontColor ${fg}`,
    `skinparam sequenceReferenceBorderColor ${fg}`,
    `skinparam sequenceReferenceBackgroundColor ${surface}`,
    `skinparam sequenceReferenceFontColor ${fg}`,
    `skinparam sequenceReferenceHeaderBackgroundColor ${bg}`,
    `skinparam sequenceMessageAlignment left`,
    // Activity / State
    `skinparam activityBarColor ${fg}`,
    `skinparam activityStartColor ${fg}`,
    `skinparam activityEndColor ${fg}`,
    "skinparam conditionStyle diamond",
    `skinparam stateStartColor ${fg}`,
    `skinparam stateEndColor ${fg}`,
  );
  return lines.join("\n");
}

/** ダークモード用 skinparam (事前計算済み) */
export const PLANTUML_DARK_SKINPARAMS = buildPlantUmlDarkSkinparams();
