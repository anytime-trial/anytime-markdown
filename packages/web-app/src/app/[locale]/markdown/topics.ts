/**
 * `/markdown/<topic>` のトピックレジストリ。
 *
 * ルーティング（`generateStaticParams`）・描画・sitemap・テストがすべてここを唯一の
 * 出どころにする。トピックを増やすときは本ファイルと i18n の 2 ファイルだけを触る。
 *
 * 記法サンプルのコード自体は翻訳対象ではないため i18n へ置かない（ja / en へ同じ
 * 文字列を二重に持つと必ず片方だけ古くなる）。見出し・説明文だけを i18n が持つ。
 */

export const TOPIC_SLUGS = ['mermaid', 'plantuml', 'katex', 'diff', 'table'] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export interface TopicSample {
  /** i18n のキー（`<slug>.samples.<key>.caption` / `.note`） */
  readonly key: string;
  /** `pre` にそのまま出す原文。Markdown の本文へ貼れる形で書く */
  readonly code: string;
}

export interface TopicDefinition {
  readonly slug: TopicSlug;
  readonly samples: readonly TopicSample[];
  /** i18n のキー（`<slug>.features.<key>.title` / `.body`） */
  readonly featureKeys: readonly string[];
  /** i18n のキー（`<slug>.faq.<key>.question` / `.answer`） */
  readonly faqKeys: readonly string[];
}

const MERMAID_FLOWCHART = `\`\`\`mermaid
flowchart TD
    A[Write the draft] --> B{Need a diagram?}
    B -- yes --> C[Add a mermaid block]
    B -- no --> D[Publish as is]
    C --> D
\`\`\``;

const MERMAID_SEQUENCE = `\`\`\`mermaid
sequenceDiagram
    participant B as Browser
    participant S as Server
    B->>S: save request
    S-->>B: saved revision
\`\`\``;

const PLANTUML_CLASS = `\`\`\`plantuml
@startuml
class Document {
  +title: string
  +save(): void
}
class Revision
Document "1" o-- "*" Revision
@enduml
\`\`\``;

const PLANTUML_SEQUENCE = `\`\`\`plantuml
@startuml
actor User
User -> Editor: write the body
Editor -> Storage: keep a draft
Storage --> Editor: saved at
@enduml
\`\`\``;

const KATEX_INLINE = `Area: $S = \\pi r^2$`;

const KATEX_BLOCK = `$$
\\int_{0}^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$`;

const DIFF_BEFORE = `## Getting started

1. Open the page
2. Write the body`;

const DIFF_AFTER = `## Getting started

1. Open the page (no sign-up)
2. Write the body
3. Take it out as Markdown`;

const TABLE_PIPE = `| Syntax | Use | Rendered |
| --- | --- | --- |
| Mermaid | flow and sequence | in the browser |
| PlantUML | class and deployment | external server |`;

const TABLE_ALIGN = `| Item | Qty | Price |
| :--- | ---: | ---: |
| Paper | 120 | 8 |
| Envelope | 40 | 25 |`;

export const TOPICS: Readonly<Record<TopicSlug, TopicDefinition>> = {
  mermaid: {
    slug: 'mermaid',
    samples: [
      { key: 'flowchart', code: MERMAID_FLOWCHART },
      { key: 'sequence', code: MERMAID_SEQUENCE },
    ],
    featureKeys: ['inline', 'local', 'portable'],
    faqKeys: ['install', 'github', 'types'],
  },
  plantuml: {
    slug: 'plantuml',
    samples: [
      { key: 'class', code: PLANTUML_CLASS },
      { key: 'sequence', code: PLANTUML_SEQUENCE },
    ],
    featureKeys: ['inline', 'consent', 'portable'],
    faqKeys: ['install', 'server', 'mermaid'],
  },
  katex: {
    slug: 'katex',
    samples: [
      { key: 'inline', code: KATEX_INLINE },
      { key: 'block', code: KATEX_BLOCK },
    ],
    featureKeys: ['inline', 'local', 'portable'],
    faqKeys: ['latex', 'install', 'export'],
  },
  diff: {
    slug: 'diff',
    samples: [
      { key: 'before', code: DIFF_BEFORE },
      { key: 'after', code: DIFF_AFTER },
    ],
    featureKeys: ['sideBySide', 'merge', 'local'],
    faqKeys: ['upload', 'privacy', 'format'],
  },
  table: {
    slug: 'table',
    samples: [
      { key: 'pipe', code: TABLE_PIPE },
      { key: 'align', code: TABLE_ALIGN },
    ],
    featureKeys: ['cells', 'gfm', 'portable'],
    faqKeys: ['syntax', 'github', 'install'],
  },
};

/** 未知の slug を弾く。`[topic]` は任意の文字列を受け取るため、描画前に必ず通す */
export function isTopicSlug(value: string): value is TopicSlug {
  return (TOPIC_SLUGS as readonly string[]).includes(value);
}

/** sitemap と内部リンクが使う、ロケールプレフィックス無しのパス */
export function topicPath(slug: TopicSlug): string {
  return `/markdown/${slug}`;
}
