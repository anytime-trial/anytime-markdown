/**
 * markdown 本文を見出し粒度の節に分割する純粋関数。
 *
 * 各見出しの節は「次の同/上位レベル見出し」まで（＝get_section と同じセマンティクス）。
 * ネストする子見出しの本文は親節にも含まれる（検索網羅性のため意図的）。
 * コードフェンス内の `#` は見出しとして扱わない（getOutline と同じガード）。
 */

/** 1 節（見出し＋レベル＋本文）。本文は見出し行を含む。 */
export interface DocSection {
  /** 見出しテキスト（`#` マークなし）。リード節は空文字。 */
  heading: string;
  /** 見出しレベル（1〜6）。リード節は 0。 */
  level: number;
  /** 節本文（見出し行を含む・trim 済み）。 */
  text: string;
}

interface HeadingPos {
  level: number;
  text: string;
  /** 0-based 行インデックス。 */
  lineIdx: number;
}

function extractHeadingPositions(lines: string[]): HeadingPos[] {
  const headings: HeadingPos[] = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) headings.push({ level: m[1].length, text: m[2].trimEnd(), lineIdx: i });
  }
  return headings;
}

/**
 * 本文を {@link DocSection}[] に分割する。見出しが無い場合は本文全体を 1 リード節として返す。
 * 空（空白のみ）本文は空配列。
 */
export function splitSections(body: string): DocSection[] {
  const lines = body.split('\n');
  const headings = extractHeadingPositions(lines);
  const sections: DocSection[] = [];

  // 先頭見出しより前の前文をリード節として扱う（heading='' level=0）。
  const firstHeadingLine = headings.length ? headings[0].lineIdx : lines.length;
  const lead = lines.slice(0, firstHeadingLine).join('\n').trim();
  if (lead) sections.push({ heading: '', level: 0, text: lead });

  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h];
    let endLine = lines.length;
    for (let j = h + 1; j < headings.length; j++) {
      if (headings[j].level <= cur.level) {
        endLine = headings[j].lineIdx;
        break;
      }
    }
    const text = lines.slice(cur.lineIdx, endLine).join('\n').trim();
    sections.push({ heading: cur.text, level: cur.level, text });
  }

  return sections;
}
