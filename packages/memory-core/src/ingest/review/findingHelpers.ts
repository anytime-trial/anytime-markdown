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
 * 指摘群の最大重大度を返す（error > warn > info）。memory_reviews.severity_overall に使う。
 * 指摘が無ければ 'info'。
 */
export function maxSeverity(
  findings: ReadonlyArray<{ severity: ParsedFinding['severity'] }>,
): ParsedFinding['severity'] {
  let result: ParsedFinding['severity'] = 'info';
  for (const f of findings) {
    if (f.severity === 'error') return 'error';
    if (f.severity === 'warn') result = 'warn';
  }
  return result;
}

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
 *
 * 優先順位 (上位を満たした時点で確定):
 * 1. admonition `> [!CAUTION]` / `> [!WARNING]` → error
 * 2. body キーワード (セキュリティ侵害 / XSS / Critical 等) → error
 * 3. admonition `> [!IMPORTANT]` / `**注意:**` → warn
 * 4. body キーワード (NULL ref / 非推奨 / 競合状態 等) → warn
 * 5. body キーワード (命名 / 可読性 等) → info (明示)
 * 6. default → info
 */
const ERROR_KEYWORDS_RE =
  /Critical|致命的|セキュリティ侵害|データ漏洩|XSS|SQL injection|RCE|認証バイパス|権限昇格/i;
const WARN_KEYWORDS_RE =
  /NULL ref|null 参照|競合状態|race condition|off-by-one|非推奨|deprecated|メモリリーク|memory leak|未定義動作/i;
const INFO_KEYWORDS_RE = /命名|可読性|リファクタリング|refactor|スタイル/i;

export function inferSeverity(chapterBody: string): ParsedFinding['severity'] {
  if (/^>\s*\[!CAUTION\]|^>\s*\[!WARNING\]/m.test(chapterBody)) {
    return 'error';
  }
  if (ERROR_KEYWORDS_RE.test(chapterBody)) {
    return 'error';
  }
  if (/(?:^>\s*\[!IMPORTANT\]|\*\*注意:\*\*)/m.test(chapterBody)) {
    return 'warn';
  }
  if (WARN_KEYWORDS_RE.test(chapterBody)) {
    return 'warn';
  }
  if (INFO_KEYWORDS_RE.test(chapterBody)) {
    return 'info';
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
const BULLET_PREFIX = String.raw`(?:[-*+]\s+)?`;

/** `**marker:**` または `**marker**:` 形式の判定正規表現を marker 配列から生成する。 */
function buildMarkerRegex(markers: readonly string[]): RegExp {
  const escaped = markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join('|');
  // ^[bullet]? **(marker)[：:]** または **(marker)**[：:]
  return new RegExp(
    String.raw`^${BULLET_PREFIX}\*\*(?:${escaped})[：:]\*\*|^${BULLET_PREFIX}\*\*(?:${escaped})\*\*[：:]`,
    'i',
  );
}

const PROBLEM_LINE_RE = buildMarkerRegex(PROBLEM_MARKERS);
const SUGGESTION_LINE_RE = buildMarkerRegex(SUGGESTION_MARKERS);

/** 行頭マーカー（bullet + `**marker:**` or `**marker**:`）を除去して残りを返す */
function stripMarker(line: string, markers: readonly string[]): string {
  const escaped = markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join('|');
  const re = new RegExp(
    String.raw`^${BULLET_PREFIX}\*\*(?:${escaped})[：:]\*\*|^${BULLET_PREFIX}\*\*(?:${escaped})\*\*[：:]`,
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
// ⚠️ は U+26A0 + U+FE0F の合成絵文字。文字クラス内に入れると U+FE0F(異体字セレクタ)
// 単独や U+26A0 単独にもマッチしてしまうため、合成文字は交替として外に出す (S5868)。
const NUMBERED_BOUNDARY_RE =
  /^(?:(?:⚠️|[\p{Emoji_Presentation}\u{1F534}\u{1F7E1}\u{1F7E2}\u{1F535}\u{26AB}\u{26AA}])\s*)?\*\*(\d+)\.\s+(.+?)\*\*\s*$/u;

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

/**
 * review-finding-format スキルが定める明示メタ行 `- 重大度: <level>` / `severity: <level>`
 * を解析する。行頭（bullet `- `/`* `/`+ ` と bold `**...**` を許容）に現れた最初のマーカーを
 * 採用する。明示マーカーが無ければ null を返し、呼び出し側はキーワード/見出し推論へ
 * フォールバックする。
 *
 * level の語彙:
 * - error: error / エラー / critical / 致命的 / 重大
 * - warn:  warn / warning / 警告 / 重要 / 注意
 * - info:  info / 情報 / 軽微 / minor / low
 *
 * `^` は multiline で行頭に限定するため、code block 内の `const 重大度: ...` 等は
 * 行頭が `重大度`/`severity`（± bullet/bold）でない限りマッチしない。
 */
const SEVERITY_MARKER_RE = new RegExp(
  String.raw`^${BULLET_PREFIX}\*{0,2}(?:重大度|severity)\*{0,2}\s*[：:]\s*\*{0,2}\s*([^\n*]+)`,
  'im',
);

export function parseSeverityMarker(body: string): ParsedFinding['severity'] | null {
  const m = SEVERITY_MARKER_RE.exec(body);
  if (!m) return null;
  const value = m[1].trim().toLowerCase();
  if (/error|エラー|critical|致命的|重大/i.test(value)) return 'error';
  if (/warn|warning|警告|重要|注意/i.test(value)) return 'warn';
  if (/info|情報|軽微|minor|low/i.test(value)) return 'info';
  return null;
}

// ── Target file path extraction from finding body ────────────────────────────

/**
 * finding 本文・タイトル・suggestion 等のテキスト塊から最も「これがターゲットファイル」
 * と判断できる相対パスを抽出する。
 *
 * 優先順位:
 * 1. `packages/<pkg>/...` (backtick 内/外問わず)
 * 2. `src/...` / `tests?/...` / `spec/...` (backtick 内/外問わず)
 * 3. backtick 内のその他相対パス（拡張子で判定）
 *
 * 行末や本文中の `:<line>` `:<line>-<line>` サフィックスは除去してパスのみ返す。
 * 一致なしは null。
 */
const FILE_EXT_RE = String.raw`(?:tsx?|jsx?|mts|cts|mjs|cjs|md|sql|json|yml|yaml|css|scss|html?)`;
const PATH_TOKEN_RE = new RegExp(
  String.raw`(?:packages\/[\w@.\-]+\/)?(?:src|tests?|spec|scripts|\.github\/workflows|docs|public|migrations)\/[\w./\-]+\.${FILE_EXT_RE}(?::\d+(?:-\d+)?)?`,
  'g',
);

function stripLineSuffix(p: string): string {
  return p.replace(/:\d+(?:-\d+)?$/, '');
}

export function extractTargetFromFinding(text: string): string | null {
  if (!text) return null;

  const candidates: string[] = [];

  // 1. backtick で囲まれたパス全部
  const btRe = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = btRe.exec(text)) !== null) {
    const inner = m[1].trim();
    if (PATH_TOKEN_RE.test(inner)) {
      PATH_TOKEN_RE.lastIndex = 0;
      candidates.push(stripLineSuffix(inner));
    }
  }

  // 2. 本文中のパス（backtick 外）
  PATH_TOKEN_RE.lastIndex = 0;
  let n: RegExpExecArray | null;
  while ((n = PATH_TOKEN_RE.exec(text)) !== null) {
    candidates.push(stripLineSuffix(n[0]));
  }

  if (candidates.length === 0) return null;

  // 優先順位: packages/ > src/ > tests/ / spec/ > その他
  const packagesCand = candidates.find((c) => c.startsWith('packages/'));
  if (packagesCand) return packagesCand;
  const srcCand = candidates.find((c) => c.startsWith('src/'));
  if (srcCand) return srcCand;
  return candidates[0];
}
