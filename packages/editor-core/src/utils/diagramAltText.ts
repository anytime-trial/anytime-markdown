import { detectMermaidType } from "../hooks/useMermaidRender";

/** Max input length to prevent ReDoS */
const MAX_INPUT_LENGTH = 500;
const MAX_ELEMENTS = 5;

/** Type label map (matches i18n keys from detectMermaidType) */
const TYPE_LABELS: Record<string, string> = {
  diagramFlowchart: "Flowchart",
  diagramSequence: "Sequence diagram",
  diagramClass: "Class diagram",
  diagramState: "State diagram",
  diagramEr: "ER diagram",
  diagramGantt: "Gantt chart",
  diagramPie: "Pie chart",
  diagramMindmap: "Mindmap",
  diagramGeneric: "Diagram",
};

function formatList(prefix: string, items: string[]): string {
  if (items.length === 0) return prefix;
  const shown = items.slice(0, MAX_ELEMENTS);
  const rest = items.length - MAX_ELEMENTS;
  const list = shown.join(", ");
  return rest > 0 ? `${prefix}: ${list} ...and ${rest} more` : `${prefix}: ${list}`;
}

function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

/** Check if char is a valid node ID character */
function isNodeIdChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

/** ブラケット開閉文字のマッピング */
export function closingBracket(ch: string): string | null {
  if (ch === "[") return "]";
  if (ch === "{") return "}";
  if (ch === "(") return ")";
  return null;
}

/** Skip whitespace from position i, return new position */
function skipWhitespace(code: string, i: number): number {
  while (i < code.length && (code[i] === " " || code[i] === "\t")) i++;
  return i;
}

/** Read a contiguous node ID starting at position i, return [id, newPos] */
function readNodeId(code: string, i: number): [string, number] {
  const start = i;
  while (i < code.length && isNodeIdChar(code[i])) i++;
  return [code.slice(start, i), i];
}

/** Try to extract a bracketed label at position i. Returns [label, nodeEndPos] or null. */
function tryExtractBracketedLabel(code: string, i: number): { label: string; endPos: number } | null {
  const close = closingBracket(code[i]);
  if (!close) return null;
  const closeIdx = code.indexOf(close, i + 1);
  if (closeIdx === -1) return null;
  const label = code.slice(i + 1, closeIdx).trim();
  const isValidLabel = label !== "" && !label.includes("-->") && !label.includes("---");
  return { label: isValidLabel ? label : "", endPos: closeIdx };
}

/** ノードID + ブラケットラベルを線形スキャンで抽出する */
export function extractFlowchartLabelsAndIds(code: string): { labels: string[]; nodeIds: string[] } {
  const labels: string[] = [];
  const nodeIds: string[] = [];
  let i = 0;
  while (i < code.length) {
    if (!isNodeIdChar(code[i])) { i++; continue; }
    const [id, afterId] = readNodeId(code, i);
    const ws = skipWhitespace(code, afterId);
    const bracket = tryExtractBracketedLabel(code, ws);
    if (!bracket) { i = afterId; continue; }
    if (bracket.label) labels.push(bracket.label);
    nodeIds.push(id);
    i = bracket.endPos + 1;
  }
  return { labels, nodeIds };
}

/** Scan backwards to extract a node ID ending just before `pos` */
function extractSourceId(code: string, pos: number): string {
  let s = pos;
  while (s >= 0 && (code[s] === " " || code[s] === "\t")) s--;
  const srcEnd = s + 1;
  while (s >= 0 && isNodeIdChar(code[s])) s--;
  return srcEnd > s + 1 ? code.slice(s + 1, srcEnd) : "";
}

/** Skip past a pipe-delimited label (e.g. |label|) if present, return new position */
function skipPipeLabel(code: string, pos: number): number {
  if (code[pos] !== "|") return pos;
  const pipeEnd = code.indexOf("|", pos + 1);
  return pipeEnd === -1 ? pos : skipWhitespace(code, pipeEnd + 1);
}

/** Extract a forward node ID starting at `pos`, return the ID or "" */
function extractDestId(code: string, pos: number): string {
  const start = pos;
  let end = pos;
  while (end < code.length && isNodeIdChar(code[end])) end++;
  return end > start ? code.slice(start, end) : "";
}

/** 矢印パターン (A --> B) から bare ノードIDを抽出する */
export function extractBareArrowIds(code: string): string[] {
  const bareIds: string[] = [];
  let arrowIdx = code.indexOf("-->");
  while (arrowIdx !== -1) {
    const srcId = extractSourceId(code, arrowIdx - 1);
    if (srcId) bareIds.push(srcId);

    const afterArrow = skipWhitespace(code, arrowIdx + 3);
    const afterPipe = skipPipeLabel(code, afterArrow);
    const dstId = extractDestId(code, afterPipe);
    if (dstId) bareIds.push(dstId);

    arrowIdx = code.indexOf("-->", arrowIdx + 3);
  }
  return bareIds;
}

function extractMermaidFlowchartNames(code: string): string[] {
  const { labels, nodeIds } = extractFlowchartLabelsAndIds(code);
  if (labels.length > 0) return unique(labels);
  const bareIds = extractBareArrowIds(code);
  return unique(bareIds.length > 0 ? bareIds : nodeIds);
}

function extractMermaidSequenceNames(code: string): string[] {
  const names: string[] = [];
  const keywords = ["participant", "actor"];
  for (const line of code.split("\n")) {
    const trimmed = line.trim().toLowerCase();
    for (const kw of keywords) {
      if (trimmed.startsWith(kw) && trimmed.length > kw.length && (trimmed[kw.length] === " " || trimmed[kw.length] === "\t")) {
        const name = line.trim().slice(kw.length).trim().split(/\s/)[0];
        if (name) names.push(name);
      }
    }
  }
  return unique(names);
}

/** PlantUML キーワード行から名前を抽出する */
export function extractNameFromPlantUmlLine(rest: string): string {
  if (rest.startsWith('"')) {
    const closeQuote = rest.indexOf('"', 1);
    return closeQuote > 0 ? rest.slice(1, closeQuote) : "";
  }
  const name = rest.split(/\s/)[0];
  const asIdx = name.toLowerCase().indexOf(" as ");
  return asIdx === -1 ? name : name.slice(0, asIdx);
}

/** PlantUML キーワードに一致する行からキーワード後の rest 部分を返す。一致しなければ null。 */
export function matchPlantUmlKeyword(trimmed: string, lower: string): string | null {
  const keywords = ["actor", "participant", "entity", "database", "collections"];
  for (const kw of keywords) {
    if (lower.startsWith(kw) && trimmed.length > kw.length && (trimmed[kw.length] === " " || trimmed[kw.length] === "\t")) {
      return trimmed.slice(kw.length).trim();
    }
  }
  return null;
}

function extractPlantUmlNames(code: string): string[] {
  const names: string[] = [];
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    const rest = matchPlantUmlKeyword(trimmed, trimmed.toLowerCase());
    if (!rest) continue;
    const name = extractNameFromPlantUmlLine(rest);
    if (name) names.push(name);
  }
  return unique(names);
}

/**
 * Extract a descriptive alt text from diagram source code.
 * Used for aria-label on diagram preview elements.
 */
export function extractDiagramAltText(
  code: string,
  language: "mermaid" | "plantuml" | "html" | "math"
): string {
  if (!code.trim()) return "Diagram";

  // ReDoS protection: limit input length
  const safeCode = code.slice(0, MAX_INPUT_LENGTH);

  if (language === "html") return "HTML block";

  if (language === "math") {
    const trimmed = code.trim();
    if (trimmed.length <= 30) return `Math: ${trimmed}`;
    return `Math: ${trimmed.slice(0, 30)}...`;
  }

  if (language === "plantuml") {
    const names = extractPlantUmlNames(safeCode);
    return formatList("PlantUML", names);
  }

  // Mermaid
  const mermaidType = detectMermaidType(safeCode);
  const typeLabel = TYPE_LABELS[mermaidType] || "Diagram";

  if (mermaidType === "diagramFlowchart") {
    const names = extractMermaidFlowchartNames(safeCode);
    return formatList(typeLabel, names);
  }

  if (mermaidType === "diagramSequence") {
    const names = extractMermaidSequenceNames(safeCode);
    return formatList(typeLabel, names);
  }

  // For other mermaid types, just return the type label
  return typeLabel;
}
