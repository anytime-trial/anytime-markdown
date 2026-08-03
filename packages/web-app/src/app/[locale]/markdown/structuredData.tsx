/**
 * `/markdown` とその配下 LP が共有する構造化データ。
 *
 * `MarkdownGuide` と `TopicLanding` の双方が FAQ を出すため、同じ形を 2 箇所へ
 * 書かずにここへ寄せる。
 */

export interface QandA {
  question: string;
  answer: string;
}

/**
 * FAQ の JSON-LD。
 *
 * 引数は表示に使うものと同じ配列でなければならない。構造化データにだけ存在して
 * 画面に出ていない Q&A は検索エンジンのガイドライン違反になるため、呼び出し側で
 * 配列を 1 本だけ作り、描画とここへ同じものを渡す。
 */
export function FaqJsonLd({ items }: Readonly<{ items: readonly QandA[] }>) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export interface Crumb {
  name: string;
  /** 絶対 URL。相対パスだと検索エンジンが解決先を決められない */
  url: string;
}

/** パンくずの JSON-LD。画面のパンくず表示と同じ並びを渡す */
export function BreadcrumbJsonLd({ items }: Readonly<{ items: readonly Crumb[] }>) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
