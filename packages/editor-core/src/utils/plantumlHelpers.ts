/** PlantUML 外部サーバー URL */
export const PLANTUML_SERVER = "https://www.plantuml.com/plantuml";

/** PlantUML 外部通信同意のセッションストレージキー */
export const PLANTUML_CONSENT_KEY = "plantuml-external-consent";

// PlantUML dark mode palette
const PLANTUML_DARK = { fg: "#CCCCCC", bg: "#2D2D2D", surface: "#1E1E1E" } as const;

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
    lines.push(`skinparam ${el}BorderColor ${fg}`);
    lines.push(`skinparam ${el}BackgroundColor ${bg}`);
    lines.push(`skinparam ${el}FontColor ${fg}`);
  }
  for (const el of PLANTUML_CONTAINER_ELEMENTS) {
    lines.push(`skinparam ${el}BorderColor ${fg}`);
    lines.push(`skinparam ${el}BackgroundColor ${surface}`);
    lines.push(`skinparam ${el}FontColor ${fg}`);
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
  );
  // Activity / State
  lines.push(
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
