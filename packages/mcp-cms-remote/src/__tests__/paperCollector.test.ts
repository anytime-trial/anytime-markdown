import { buildArxivQuery, formatToTsv, formatToJsonl, parseArxivResponse } from '../paperCollector';

const samplePapers = [
  {
    arxiv_id: '2603.12345v1',
    title: 'Attention Is All You Need Again',
    abstract: 'We propose a new transformer architecture...',
    published: '2026-03-28',
    authors: ['John Smith', 'Jane Doe'],
    categories: ['cs.AI', 'cs.LG'],
    pdf_url: 'http://arxiv.org/pdf/2603.12345v1',
  },
  {
    arxiv_id: '2603.12346v1',
    title: 'Secure Federated Learning',
    abstract: 'A protocol for privacy-preserving...',
    published: '2026-03-27',
    authors: ['Alice Wang'],
    categories: ['cs.CR', 'cs.DC'],
    pdf_url: 'http://arxiv.org/pdf/2603.12346v1',
  },
];

describe('buildArxivQuery', () => {
  it('builds query from single category and date range', () => {
    const query = buildArxivQuery('cs.AI', 7, '2026-04-01');
    expect(query).toBe(
      'cat:cs.AI+AND+submittedDate:[202603250000+TO+202604012359]',
    );
  });

  it('handles different lookback days', () => {
    const query = buildArxivQuery('cs.LG', 3, '2026-04-01');
    expect(query).toBe(
      'cat:cs.LG+AND+submittedDate:[202603290000+TO+202604012359]',
    );
  });
});

describe('formatToTsv', () => {
  it('generates header and data rows', () => {
    const tsv = formatToTsv(samplePapers);
    const lines = tsv.split('\n');

    expect(lines[0]).toBe('arxiv_id\tpublished\tcategories\ttitle');
    expect(lines[1]).toBe(
      '2603.12345v1\t2026-03-28\tcs.AI,cs.LG\tAttention Is All You Need Again',
    );
    expect(lines[2]).toBe(
      '2603.12346v1\t2026-03-27\tcs.CR,cs.DC\tSecure Federated Learning',
    );
    expect(lines).toHaveLength(3);
  });

  it('returns header only for empty array', () => {
    const tsv = formatToTsv([]);
    expect(tsv).toBe('arxiv_id\tpublished\tcategories\ttitle');
  });
});

describe('formatToJsonl', () => {
  it('converts each paper to a single JSON line', () => {
    const jsonl = formatToJsonl(samplePapers);
    const lines = jsonl.split('\n');

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first).toEqual({
      arxiv_id: '2603.12345v1',
      title: 'Attention Is All You Need Again',
      abstract: 'We propose a new transformer architecture...',
      published: '2026-03-28',
      authors: ['John Smith', 'Jane Doe'],
      categories: ['cs.AI', 'cs.LG'],
      pdf_url: 'http://arxiv.org/pdf/2603.12345v1',
    });
  });

  it('returns empty string for empty array', () => {
    expect(formatToJsonl([])).toBe('');
  });
});

describe('parseArxivResponse', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2603.12345v1</id>
    <published>2026-03-28T18:00:00Z</published>
    <title>Attention Is All You Need Again</title>
    <summary>We propose a new transformer architecture that improves efficiency.</summary>
    <author><name>John Smith</name></author>
    <author><name>Jane Doe</name></author>
    <link href="http://arxiv.org/pdf/2603.12345v1" rel="related" type="application/pdf" title="pdf"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2603.12346v1</id>
    <published>2026-03-27T12:00:00Z</published>
    <title>Secure Federated Learning</title>
    <summary>A protocol for privacy-preserving distributed training.</summary>
    <author><name>Alice Wang</name></author>
    <link href="http://arxiv.org/pdf/2603.12346v1" rel="related" type="application/pdf" title="pdf"/>
    <category term="cs.CR" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

  it('extracts paper data from Atom XML', () => {
    const papers = parseArxivResponse(sampleXml);

    expect(papers).toHaveLength(2);

    expect(papers[0].arxiv_id).toBe('2603.12345v1');
    expect(papers[0].title).toBe('Attention Is All You Need Again');
    expect(papers[0].abstract).toBe('We propose a new transformer architecture that improves efficiency.');
    expect(papers[0].published).toBe('2026-03-28');
    expect(papers[0].authors).toEqual(['John Smith', 'Jane Doe']);
    expect(papers[0].categories).toEqual(['cs.AI', 'cs.LG']);
    expect(papers[0].pdf_url).toBe('http://arxiv.org/pdf/2603.12345v1');

    expect(papers[1].arxiv_id).toBe('2603.12346v1');
    expect(papers[1].authors).toEqual(['Alice Wang']);
  });

  it('returns empty array for empty feed', () => {
    const papers = parseArxivResponse('<feed></feed>');
    expect(papers).toEqual([]);
  });
});
