export interface DoctrineCitation {
  readonly docPath: string;
  readonly section: string;
  readonly quote: string;
}

export type CitationFailureReason = 'ok' | 'file_not_found' | 'quote_not_found';

/**
 * 引用先の承認状態 (DCT-3)。canon_by_document は条項単位ではなく文書全体が
 * 承認済みとみなされるもの (人が直接書く明文規約)。
 */
export type CitationApproval = 'canon' | 'draft' | 'canon_by_document' | 'unknown';

export interface ResolvedCitation extends DoctrineCitation {
  readonly resolved: boolean;
  readonly reason: CitationFailureReason;
  readonly approval: CitationApproval;
}

/** ドクトリン正本（条項単位で承認状態を持つ文書）を識別するパス断片 */
const DOCTRINE_PATH_SEGMENT = '/92.doctrine/';

/** 空白の揺れ（改行・連続空白・全角スペース）を単一半角スペースへ正規化する */
function normalizeWhitespace(text: string): string {
  return text.replace(/[\s　]+/g, ' ').trim();
}

/**
 * 人が直接書き、人の編集以外で変わらない明文規約。文書全体を canon とみなす。
 * 抽出スキルの生成物ではないため、条項単位の承認状態を持たない。
 */
function isCodifiedNorm(docPath: string): boolean {
  const basename = docPath.slice(docPath.lastIndexOf('/') + 1);
  return (
    basename === 'CLAUDE.md' ||
    basename === 'AGENTS.md' ||
    basename === 'SKILL.md' ||
    docPath.includes('/.claude/rules/')
  );
}

/**
 * 引用が属する条項ブロック (`### ` 見出しから次の見出しまで) を特定し、その
 * `- 承認:` 行を読む。条項の外からの引用・承認行のない条項はいずれも draft
 * (fail-closed。記載漏れを canon 側へ倒さない)。
 */
function resolveClauseApproval(body: string, normalizedQuote: string): CitationApproval {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of body.split('\n')) {
    if (line.startsWith('### ')) {
      current = [line];
      blocks.push(current);
    } else if (line.startsWith('## ')) {
      current = null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  for (const block of blocks) {
    if (!normalizeWhitespace(block.join('\n')).includes(normalizedQuote)) {
      continue;
    }
    const approvalLine = block.find((line) => /^\s*-\s*承認:/.test(line));
    return approvalLine !== undefined && /承認:\s*canon\b/.test(approvalLine) ? 'canon' : 'draft';
  }
  return 'draft';
}

/**
 * 解決済み引用の承認状態を判定する (DCT-3)。解決していない引用の承認状態は
 * 論じない (unknown)。解決検査と承認状態は独立であり、幻覚引用 (誤り) と
 * 未承認引用 (正常な段階差) を 1 つの真偽値へ畳まない。
 */
function resolveApproval(docPath: string, body: string, normalizedQuote: string): CitationApproval {
  if (isCodifiedNorm(docPath)) {
    return 'canon_by_document';
  }
  if (docPath.includes(DOCTRINE_PATH_SEGMENT)) {
    return resolveClauseApproval(body, normalizedQuote);
  }
  return 'unknown';
}

/**
 * ドクトリン引用の解決検査（DCT-9）。引用ごとに「文書が実在し、逐語引用が本文に
 * 一致するか」を判定する。ファイル読取は注入（reader が null を返したら不在）。
 *
 * SHORTCUT: section 見出しの実在は検査しない. ceiling: quote 一致のみで解決判定
 * (section はメタデータ). upgrade: 引用解決率の実測で section ずれが問題化したら
 * 見出し照合を追加.
 */
export function resolveCitations(
  citations: ReadonlyArray<DoctrineCitation>,
  reader: (path: string) => string | null,
): ResolvedCitation[] {
  return citations.map((citation) => {
    const body = reader(citation.docPath);
    if (body === null) {
      return {
        ...citation,
        resolved: false,
        reason: 'file_not_found' as const,
        approval: 'unknown' as const,
      };
    }
    const quote = normalizeWhitespace(citation.quote);
    if (quote === '' || !normalizeWhitespace(body).includes(quote)) {
      return {
        ...citation,
        resolved: false,
        reason: 'quote_not_found' as const,
        approval: 'unknown' as const,
      };
    }
    return {
      ...citation,
      resolved: true,
      reason: 'ok' as const,
      approval: resolveApproval(citation.docPath, body, quote),
    };
  });
}
