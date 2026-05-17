// ── Shared types ──────────────────────────────────────────────────────────────

export type ParsedFinding = {
  finding_index: number;
  target_file_path: string | null;
  target_symbol: string | null;
  target_line_start: number | null;
  target_line_end: number | null;
  category: 'design' | 'a11y' | 'security' | 'perf' | 'naming' | 'spec' | 'logic' | 'other';
  severity: 'info' | 'warn' | 'error';
  finding_text: string;
  suggestion_text: string;
  chapter_path: string;
  is_category_inferred: boolean;
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Category inference from chapter title.
 * Note: a11y is checked before design so that コントラスト (a11y) takes precedence
 * over カラー (design) when both appear in the same title.
 */
export function inferCategory(
  chapterTitle: string,
): { category: ParsedFinding['category']; is_category_inferred: boolean } {
  if (/アクセシビリティ|aria|コントラスト|キーボード|フォーカス/i.test(chapterTitle)) {
    return { category: 'a11y', is_category_inferred: false };
  }
  if (/カラー|タイポグラフィ|CTA|レイアウト|余白|デザイン/i.test(chapterTitle)) {
    return { category: 'design', is_category_inferred: false };
  }
  if (/XSS|SQL injection|認証|認可|機密情報|セキュリティ/i.test(chapterTitle)) {
    return { category: 'security', is_category_inferred: false };
  }
  if (/パフォーマンス|レンダリング|キャッシュ|バンドルサイズ/i.test(chapterTitle)) {
    return { category: 'perf', is_category_inferred: false };
  }
  if (/命名|スタイル|可読性/i.test(chapterTitle)) {
    return { category: 'naming', is_category_inferred: false };
  }
  if (/仕様|spec|要件/i.test(chapterTitle)) {
    return { category: 'spec', is_category_inferred: false };
  }
  if (/ロジック|条件分岐|Off-by-one|例外/i.test(chapterTitle)) {
    return { category: 'logic', is_category_inferred: false };
  }
  return { category: 'other', is_category_inferred: true };
}

/**
 * Severity inference from chapter body text.
 */
export function inferSeverity(chapterBody: string): ParsedFinding['severity'] {
  if (/^>\s*\[!CAUTION\]|^>\s*\[!WARNING\]/m.test(chapterBody)) {
    return 'error';
  }
  if (/^>\s*\[!IMPORTANT\]|\*\*注意:\*\*/m.test(chapterBody)) {
    return 'warn';
  }
  return 'info';
}

/**
 * Extract backtick-enclosed paths from a line.
 */
export function extractBacktickPaths(line: string): string[] {
  const paths: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

export type ChapterBlock = {
  heading: string;
  lines: string[];
};

/**
 * Split body lines into chapter blocks keyed by ## / ### headings.
 * Lines before the first heading are collected under a synthetic '' heading.
 */
export function splitIntoChapters(bodyLines: string[]): ChapterBlock[] {
  const chapters: ChapterBlock[] = [];
  let current: ChapterBlock = { heading: '', lines: [] };

  for (const line of bodyLines) {
    const headingMatch = /^#{2,3}\s+(.+)$/.exec(line);
    if (headingMatch) {
      chapters.push(current);
      current = { heading: headingMatch[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  chapters.push(current);
  return chapters;
}

// ── Finding extraction (Sample 0: paired markers) ────────────────────────────

/**
 * 問題マーカーとして認識する語。`**<marker>:**` または `**<marker>**:` の形で
 * 行頭（bullet 接頭辞 `- `/`* `/`+ ` 許容）に現れた場合に finding 開始とみなす。
 */
const PROBLEM_MARKERS = [
  '問題', '問題点', '指摘', '指摘事項', '内容',
  'Issue', 'Problem', 'Finding',
] as const;

/**
 * 提案マーカーとして認識する語。`**<marker>:**` または `**<marker>**:` の形で
 * 行頭（bullet 接頭辞許容）に現れた場合に suggestion 開始とみなす。
 */
const SUGGESTION_MARKERS = [
  '提案', '改善方法', '改善案', '推奨', '推奨修正', '対処案', '修正',
  'Recommendation', 'Suggestion', 'Fix',
] as const;

/** bullet 接頭辞 `- ` / `* ` / `+ ` を吸収する prefix 正規表現片 */
const BULLET_PREFIX = '(?:[-*+]\\s+)?';

/** `**marker:**` または `**marker**:` 形式の判定正規表現を marker 配列から生成する。 */
function buildMarkerRegex(markers: readonly string[]): RegExp {
  const escaped = markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // ^[bullet]? **(marker)[：:]** または **(marker)**[：:]
  return new RegExp(
    `^${BULLET_PREFIX}\\*\\*(?:${escaped})[：:]\\*\\*|^${BULLET_PREFIX}\\*\\*(?:${escaped})\\*\\*[：:]`,
    'i',
  );
}

const PROBLEM_LINE_RE = buildMarkerRegex(PROBLEM_MARKERS);
const SUGGESTION_LINE_RE = buildMarkerRegex(SUGGESTION_MARKERS);

/** 行頭マーカー（bullet + `**marker:**` or `**marker**:`）を除去して残りを返す */
function stripMarker(line: string, markers: readonly string[]): string {
  const escaped = markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(
    `^${BULLET_PREFIX}\\*\\*(?:${escaped})[：:]\\*\\*|^${BULLET_PREFIX}\\*\\*(?:${escaped})\\*\\*[：:]`,
    'i',
  );
  return line.replace(re, '').trim();
}

/**
 * Given the lines of a chapter, extract all (problem, suggestion) pairs.
 * Returns an array of [findingText, suggestionText] tuples.
 *
 * 認識する書式（行頭 bullet 接頭辞 `- ` 等を許容）:
 * - `**問題:** ... **提案:** ...` （既存）
 * - `**問題点:** / **内容:** / **指摘:** ...` 等の問題マーカー
 * - `**改善方法:** / **推奨修正:** / **対処案:** / **修正:** ...` 等の提案マーカー
 * - `- **内容**:` のように bullet 接頭辞付き（Sample 1 形式）
 */
export function extractProblemSuggestionPairs(lines: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const isProblemLine = (l: string) => PROBLEM_LINE_RE.test(l);
  const isSuggestionLine = (l: string) => SUGGESTION_LINE_RE.test(l);

  let i = 0;
  while (i < lines.length) {
    if (isProblemLine(lines[i])) {
      const findingLines: string[] = [];
      const problemRest = stripMarker(lines[i], PROBLEM_MARKERS);
      if (problemRest) findingLines.push(problemRest);
      i++;

      while (i < lines.length && !isSuggestionLine(lines[i]) && !isProblemLine(lines[i])) {
        findingLines.push(lines[i]);
        i++;
      }

      const suggestionLines: string[] = [];
      if (i < lines.length && isSuggestionLine(lines[i])) {
        const suggestionRest = stripMarker(lines[i], SUGGESTION_MARKERS);
        if (suggestionRest) suggestionLines.push(suggestionRest);
        i++;

        while (i < lines.length && !isProblemLine(lines[i]) && !isSuggestionLine(lines[i])) {
          suggestionLines.push(lines[i]);
          i++;
        }
      }

      pairs.push([findingLines.join('\n').trim(), suggestionLines.join('\n').trim()]);
    } else {
      i++;
    }
  }

  return pairs;
}

// ── Finding extraction (Sample 2/3: numbered findings) ───────────────────────

/** Sample 2/3 の境界判定: `🟡 **N. title**` または `**N. title**` */
const NUMBERED_BOUNDARY_RE =
  /^(?:[\p{Emoji_Presentation}⚠️\u{1F534}\u{1F7E1}\u{1F7E2}\u{1F535}\u{26AB}\u{26AA}]\s*)?\*\*(\d+)\.\s+(.+?)\*\*\s*$/u;

/**
 * Sample 2/3 の suggestion インラインマーカー（bold なし、コロン必須）。
 * 例: `修正: ...` `対処案: ...` `提案: ...` `推奨: ...` `改善方法: ...`
 */
const INLINE_SUGGESTION_RE = /^(?:修正|対処案|提案|推奨|改善方法|改善案|推奨修正|Fix|Suggestion|Recommendation)[：:]\s*/i;

export type NumberedFinding = {
  title: string;
  finding: string;
  suggestion: string;
};

/**
 * chapter 本文から番号付き finding（Sample 2: emoji + `**N. title**` / Sample 3: `**N. title**`）を抽出する。
 *
 * - 境界線（`🟡 **N. title**` 等）で finding を区切る
 * - 各 finding 内で `修正:` / `対処案:` 等のインライン suggestion 行を suggestion として切り出す
 * - suggestion マーカー以降 (chapter 終端 or 次境界まで) を suggestion 本文
 */
export function extractNumberedFindings(lines: string[]): NumberedFinding[] {
  const results: NumberedFinding[] = [];
  let current: NumberedFinding | null = null;
  let inSuggestion = false;
  const findingLines: string[] = [];
  const suggestionLines: string[] = [];

  const flush = () => {
    if (current == null) return;
    current.finding = findingLines.join('\n').trim();
    current.suggestion = suggestionLines.join('\n').trim();
    results.push(current);
    current = null;
    inSuggestion = false;
    findingLines.length = 0;
    suggestionLines.length = 0;
  };

  for (const line of lines) {
    const boundaryMatch = NUMBERED_BOUNDARY_RE.exec(line.trim());
    if (boundaryMatch) {
      flush();
      current = { title: boundaryMatch[2].trim(), finding: '', suggestion: '' };
      continue;
    }
    if (current == null) continue; // skip lines before first boundary

    const inlineSuggestionMatch = INLINE_SUGGESTION_RE.exec(line);
    if (inlineSuggestionMatch && !inSuggestion) {
      inSuggestion = true;
      const rest = line.replace(INLINE_SUGGESTION_RE, '').trim();
      if (rest) suggestionLines.push(rest);
      continue;
    }

    if (inSuggestion) {
      suggestionLines.push(line);
    } else {
      findingLines.push(line);
    }
  }
  flush();

  return results;
}

// ── Severity inference from heading (Sample 3 chapter name → severity) ───────

/**
 * chapter 見出しの severity 表現から severity を推論する。
 * - Critical / 重大 / Error → 'error'
 * - Important / 重要 / Warning → 'warn'
 * - Suggestion / 推奨 / Info / 軽微 → 'info'
 * - その他 → 'info' (default)
 */
export function inferSeverityFromHeading(heading: string): ParsedFinding['severity'] {
  if (/Critical|重大|Error|エラー/i.test(heading)) return 'error';
  if (/Important|重要|Warning|警告/i.test(heading)) return 'warn';
  if (/Suggestion|推奨|Info|軽微|情報/i.test(heading)) return 'info';
  return 'info';
}
