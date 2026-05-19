import type { HeuristicScore } from './types';

/**
 * Heuristic スコア計算: LLM を使わずテキスト統計だけで類似度を測る。
 * - Intent: TF コサイン類似度
 * - Design: 0.6 × 識別子 Jaccard + 0.4 × 見出し Jaccard
 * - Completeness: golden 見出しの candidate 包含率
 */

const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'not', 'no', 'as', 'if', 'then',
  'than', 'so', 'up', 'out', 'about',
]);

const STOPWORDS_JA = new Set([
  'の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'から', 'まで',
  'です', 'ます', 'する', 'ある', 'いる', 'こと', 'もの', 'これ',
  'それ', 'あれ', 'この', 'その', 'あの', 'および', 'または', 'ただし',
]);

/**
 * 英日混在トークナイザ。
 * - 英数字: 小文字化、長さ 2 以上、英語 stopword 除去
 * - 日本語: CJK / ひらがな / カタカナの連続列を 2 文字 bigram に分解。
 *   完全一致 stopword (助詞単独など) と bigram 構成済み stopword は除去。
 *
 * 形態素解析は行わない (依存追加を避ける)。文字 bigram で「同じ用語が
 * 同じ bigram 列を生む」性質を heuristic として、cosine 類似度の母数を確保する。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 英数字トークン
  const englishMatches = text.toLowerCase().match(/[a-z][a-z0-9_-]*/g) ?? [];
  for (const w of englishMatches) {
    if (w.length > 1 && !STOPWORDS_EN.has(w)) tokens.push(w);
  }

  // 日本語連続列 (CJK 統合漢字 + ひらがな + カタカナ) を bigram 化
  const japaneseChunks = text.match(/[぀-ヿ一-龯]+/g) ?? [];
  for (const chunk of japaneseChunks) {
    if (STOPWORDS_JA.has(chunk)) continue;
    if (chunk.length === 1) {
      tokens.push(chunk);
      continue;
    }
    // 長さ 2 以上 → 文字 bigram (重なりあり) を生成
    for (let i = 0; i < chunk.length - 1; i++) {
      const bigram = chunk.slice(i, i + 2);
      if (!STOPWORDS_JA.has(bigram)) tokens.push(bigram);
    }
  }

  return tokens;
}

/**
 * 技術識別子の抽出。CamelCase / snake_case / kebab-case / path-like を拾う。
 * 大文字小文字は揃えるため最終的に lowercase で集合化。
 *
 * パスは `[\w./-]+` という単一 char class でスキャンしてから `/` 包含で
 * フィルタする。`[\w-]+(?:\/[\w-]+)+(?:\.[\w-]+)?` の重複可能な量指定子を
 * 含む形は CodeQL `js/polynomial-redos` の対象になるため使わない。
 */
export function extractIdentifiers(text: string): Set<string> {
  const result = new Set<string>();
  // CamelCase: 連続する単語境界 + 大文字+小文字 が 2 つ以上
  const camel = text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) ?? [];
  // snake_case: 小文字英数字 + アンダースコア区切り
  const snake = text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
  // kebab-case: 小文字英数字 + ハイフン区切り
  const kebab = text.match(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g) ?? [];
  // path-like: 単一 char class でスキャン → `/` を含むものだけ採用
  const pathLike = text.match(/[\w./-]+/g) ?? [];
  const paths = pathLike.filter((s) => s.includes('/'));

  for (const s of [...camel, ...snake, ...kebab, ...paths]) {
    result.add(s.toLowerCase());
  }
  return result;
}

/**
 * Markdown 見出しの抽出。前後空白除去 + 末尾コロン (半角/全角) 除去 + 小文字化。
 *
 * `/^#+\s+(.+)$/gm` の代わりに行単位の手動スキャンを使う。
 * `\s+` と `(.+)` の組合せが CodeQL `js/polynomial-redos` の対象になるため。
 */
export function extractHeadings(text: string): Set<string> {
  const result = new Set<string>();
  for (const rawLine of text.split('\n')) {
    let i = 0;
    while (i < rawLine.length && rawLine.charCodeAt(i) === 0x23 /* '#' */) i++;
    if (i === 0) continue;
    let j = i;
    while (
      j < rawLine.length &&
      (rawLine.charCodeAt(j) === 0x20 /* space */ ||
        rawLine.charCodeAt(j) === 0x09 /* tab */)
    ) {
      j++;
    }
    if (j === i) continue; // '#' の直後に空白がない (例: '#abc') は見出しではない
    let h = rawLine.slice(j).trim();
    // 末尾の半角/全角コロン + 空白を除去
    while (h.length > 0) {
      const last = h.charCodeAt(h.length - 1);
      if (last === 0x20 || last === 0x09) {
        h = h.slice(0, -1);
        continue;
      }
      if (last === 0x3a /* ':' */ || last === 0xff1a /* '：' */) {
        h = h.slice(0, -1);
        continue;
      }
      break;
    }
    h = h.toLowerCase();
    if (h.length > 0) result.add(h);
  }
  return result;
}

export function cosineSimilarity(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): number {
  if (a.size === 0 || b.size === 0) return 0.0;

  let dot = 0;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined) dot += v * bv;
  }

  let magA = 0;
  for (const v of a.values()) magA += v * v;
  let magB = 0;
  for (const v of b.values()) magB += v * v;
  if (magA === 0 || magB === 0) return 0.0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

function toFrequencyMap(tokens: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) {
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Reference と Candidate のドキュメントから 3 軸スコアを計算。
 */
export function scoreHeuristic(reference: string, candidate: string): HeuristicScore {
  // Intent: 本文 TF cosine
  const refFreq = toFrequencyMap(tokenize(reference));
  const candFreq = toFrequencyMap(tokenize(candidate));
  const intent = round4(cosineSimilarity(refFreq, candFreq));

  // Design: 識別子 Jaccard と見出し Jaccard の重み付き和
  const refIds = extractIdentifiers(reference);
  const candIds = extractIdentifiers(candidate);
  const refHeadings = extractHeadings(reference);
  const candHeadings = extractHeadings(candidate);
  const idSim = jaccardSimilarity(refIds, candIds);
  const headingSim = jaccardSimilarity(refHeadings, candHeadings);
  const design = round4(0.6 * idSim + 0.4 * headingSim);

  // Completeness: golden 見出しの candidate 包含率
  let completeness: number;
  if (refHeadings.size === 0) {
    // golden に見出しがない場合、candidate にも見出しがなければ満点、あれば 0
    completeness = candHeadings.size === 0 ? 1.0 : 0.0;
  } else {
    let hits = 0;
    for (const h of refHeadings) {
      if (candHeadings.has(h)) hits++;
    }
    completeness = round4(hits / refHeadings.size);
  }

  return { intent, design, completeness };
}
