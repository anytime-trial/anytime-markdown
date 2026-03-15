/**
 * PlantUML skinparam / !theme ディレクティブの抽出・合成ユーティリティ
 *
 * コード先頭の連続する skinparam 行と !theme 行を config として分離する。
 */

const CONFIG_LINE_RE = /^(skinparam\s|!theme\s|!define\s|!include\s)/;

/**
 * コード先頭の skinparam / !theme 行を分離する。
 */
export function extractPlantUmlConfig(code: string): { config: string; body: string } {
  const lines = code.split("\n");
  const configLines: string[] = [];
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" && configLines.length === 0) {
      // skip leading empty lines
      bodyStart = i + 1;
      continue;
    }
    if (CONFIG_LINE_RE.test(trimmed)) {
      configLines.push(lines[i]);
      bodyStart = i + 1;
    } else {
      break;
    }
  }

  if (configLines.length === 0) return { config: "", body: code };

  // Skip empty line between config and body
  if (bodyStart < lines.length && lines[bodyStart].trim() === "") {
    bodyStart++;
  }

  return {
    config: configLines.join("\n"),
    body: lines.slice(bodyStart).join("\n"),
  };
}

/**
 * config 行と body を結合してコード文字列に戻す。
 */
export function mergePlantUmlConfig(config: string, body: string): string {
  const trimmed = config.trim();
  if (!trimmed) return body;
  return `${trimmed}\n\n${body}`;
}
