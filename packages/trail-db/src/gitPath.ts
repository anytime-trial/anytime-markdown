/** git がクォートしたパス（両端 " ＋ 8 進/文字エスケープ）を平文 UTF-8 に戻す。クォートされていなければそのまま返す。 */
export function unquoteGitPath(rawPath: string): string {
  if (!rawPath.startsWith('"') || !rawPath.endsWith('"')) return rawPath;

  const inner = rawPath.slice(1, -1);
  let decoded = '';
  const bytes: number[] = [];

  const flushBytes = (): void => {
    if (bytes.length === 0) return;
    decoded += Buffer.from(bytes).toString('utf8');
    bytes.length = 0;
  };

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char !== '\\') {
      flushBytes();
      decoded += char;
      continue;
    }

    const next = inner[index + 1];
    if (next === undefined) {
      flushBytes();
      decoded += char;
      continue;
    }

    const octal = inner.slice(index + 1, index + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }

    flushBytes();
    if (next === '\\') {
      decoded += '\\';
    } else if (next === '"') {
      decoded += '"';
    } else if (next === 't') {
      decoded += '\t';
    } else if (next === 'n') {
      decoded += '\n';
    } else if (next === 'r') {
      decoded += '\r';
    } else {
      decoded += next;
    }
    index += 1;
  }

  flushBytes();
  return decoded;
}
