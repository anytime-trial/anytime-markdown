export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }
    wrapParagraph(ctx, paragraph, maxWidth, lines);
  }

  return lines.length > 0 ? lines : [''];
}

/** 1段落分のテキストを maxWidth に収まるよう折り返し、結果を lines に追加する */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number,
  lines: string[],
): void {
  let currentLine = '';
  const tokens = paragraph.match(/\S+|\s/g) ?? [paragraph];

  for (const token of tokens) {
    if (token === ' ') {
      currentLine = handleSpaceToken(ctx, currentLine, maxWidth, lines);
      continue;
    }
    currentLine = handleWordToken(ctx, token, currentLine, maxWidth, lines);
  }

  if (currentLine) lines.push(currentLine);
}

/** スペーストークンの処理: 行幅を超える場合は改行 */
function handleSpaceToken(
  ctx: CanvasRenderingContext2D,
  currentLine: string,
  maxWidth: number,
  lines: string[],
): string {
  const testLine = currentLine + ' ';
  if (ctx.measureText(testLine).width > maxWidth && currentLine) {
    lines.push(currentLine);
    return '';
  }
  return testLine;
}

/** 単語トークンの処理: 行に追加し、溢れた場合は文字単位で分割 */
function handleWordToken(
  ctx: CanvasRenderingContext2D,
  token: string,
  currentLine: string,
  maxWidth: number,
  lines: string[],
): string {
  const testLine = currentLine + token;
  if (ctx.measureText(testLine).width <= maxWidth || currentLine === '') {
    currentLine = testLine;
  } else {
    lines.push(currentLine);
    currentLine = token;
  }

  // 単一トークンが maxWidth を超える場合、文字単位で分割
  if (ctx.measureText(currentLine).width > maxWidth) {
    currentLine = breakByCharacter(ctx, currentLine, maxWidth, lines);
  }
  return currentLine;
}

/** 文字単位で分割し、溢れた部分を lines に追加。残りの文字列を返す */
function breakByCharacter(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lines: string[],
): string {
  let rebuild = '';
  for (const c of text) {
    const test = rebuild + c;
    if (ctx.measureText(test).width > maxWidth && rebuild) {
      lines.push(rebuild);
      rebuild = c;
    } else {
      rebuild = test;
    }
  }
  return rebuild;
}
