export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }

    let currentLine = '';
    // Split by spaces while preserving CJK character boundaries
    const tokens = paragraph.match(/\S+|\s/g) ?? [paragraph];

    for (const token of tokens) {
      if (token === ' ') {
        const testLine = currentLine + ' ';
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = '';
        } else {
          currentLine = testLine;
        }
        continue;
      }

      const testLine = currentLine + token;
      if (ctx.measureText(testLine).width <= maxWidth || currentLine === '') {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = token;
      }

      // If single token exceeds maxWidth, break it character by character
      if (ctx.measureText(currentLine).width > maxWidth) {
        let rebuild = '';
        for (const c of currentLine) {
          const test = rebuild + c;
          if (ctx.measureText(test).width > maxWidth && rebuild) {
            lines.push(rebuild);
            rebuild = c;
          } else {
            rebuild = test;
          }
        }
        currentLine = rebuild;
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}
