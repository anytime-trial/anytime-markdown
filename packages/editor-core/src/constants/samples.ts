import mermaidSamplesJson from "./mermaidSamples.json";
import plantumlSamplesJson from "./plantumlSamples.json";
import htmlSamplesJson from "./htmlSamples.json";
import mathSamplesJson from "./mathSamples.json";

export type DiagramSample = { label: string; i18nKey: string; icon: string; code: string; enabled: boolean };

export const MERMAID_SAMPLES: DiagramSample[] = mermaidSamplesJson;
export const PLANTUML_SAMPLES: DiagramSample[] = plantumlSamplesJson;
export const HTML_SAMPLES: DiagramSample[] = htmlSamplesJson;
export const MATH_SAMPLES: DiagramSample[] = mathSamplesJson;
