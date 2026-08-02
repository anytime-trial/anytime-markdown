export interface DoctrineCitation {
  readonly docPath: string;
  readonly section: string;
  readonly quote: string;
}

export type CitationFailureReason = 'ok' | 'file_not_found' | 'quote_not_found';

export interface ResolvedCitation extends DoctrineCitation {
  readonly resolved: boolean;
  readonly reason: CitationFailureReason;
}

/** 空白の揺れ（改行・連続空白・全角スペース）を単一半角スペースへ正規化する */
function normalizeWhitespace(text: string): string {
  return text.replace(/[\s　]+/g, ' ').trim();
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
      return { ...citation, resolved: false, reason: 'file_not_found' as const };
    }
    const quote = normalizeWhitespace(citation.quote);
    if (quote === '' || !normalizeWhitespace(body).includes(quote)) {
      return { ...citation, resolved: false, reason: 'quote_not_found' as const };
    }
    return { ...citation, resolved: true, reason: 'ok' as const };
  });
}
