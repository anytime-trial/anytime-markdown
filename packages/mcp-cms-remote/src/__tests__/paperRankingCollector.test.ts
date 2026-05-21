import {
  buildOpenAlexUrl,
  parseOpenAlexResponse,
  formatRankingToTsv,
  parseWrittenList,
  addToWrittenList,
} from '../paperRankingCollector';

const sampleOpenAlexResults = [
  {
    title: 'RFAConv: Receptive-field attention convolution',
    cited_by_count: 84,
    publication_date: '2026-02-05',
    authorships: [
      { author: { display_name: 'Xin Zhang' } },
      { author: { display_name: 'Chen Liu' } },
    ],
    primary_topic: {
      subfield: { display_name: 'Computer Vision and Pattern Recognition' },
    },
    primary_location: {
      landing_page_url: 'https://arxiv.org/abs/2602.04567v1',
    },
  },
  {
    title: 'SAM2-UNet: Segment Anything 2 for segmentation',
    cited_by_count: 31,
    publication_date: '2026-01-13',
    authorships: [
      { author: { display_name: 'Xinyu Xiong' } },
    ],
    primary_topic: {
      subfield: { display_name: 'Radiology' },
    },
    primary_location: {
      landing_page_url: 'https://arxiv.org/abs/2601.12345v1',
    },
  },
];

describe('buildOpenAlexUrl', () => {
  it('builds URL with correct date range and parameters', () => {
    const url = buildOpenAlexUrl(1, 20, '2026-04-01', 'test@example.com');
    expect(url).toContain('https://api.openalex.org/works');
    expect(url).toContain('from_publication_date:2026-03-01');
    expect(url).toContain('to_publication_date:2026-03-31');
    expect(url).toContain('locations.source.id:S4306400194');
    expect(url).toContain('sort=cited_by_count:desc');
    expect(url).toContain('per_page=20');
    expect(url).toContain('mailto=test%40example.com');
  });

  it('computes 3-month lookback excluding current month', () => {
    const url = buildOpenAlexUrl(3, 10, '2026-04-15', 'test@example.com');
    expect(url).toContain('from_publication_date:2026-01-01');
    expect(url).toContain('to_publication_date:2026-03-31');
    expect(url).toContain('per_page=10');
  });

  it('handles year boundary for lookback', () => {
    const url = buildOpenAlexUrl(3, 20, '2026-02-15', 'test@example.com');
    expect(url).toContain('from_publication_date:2025-11-01');
    expect(url).toContain('to_publication_date:2026-01-31');
  });
});

describe('parseOpenAlexResponse', () => {
  it('extracts ranked papers from OpenAlex results', () => {
    const papers = parseOpenAlexResponse(sampleOpenAlexResults);

    expect(papers).toHaveLength(2);

    expect(papers[0]).toEqual({
      arxiv_id: '2602.04567v1',
      title: 'RFAConv: Receptive-field attention convolution',
      cited_by_count: 84,
      publication_date: '2026-02-05',
      authors: ['Xin Zhang', 'Chen Liu'],
      subfield: 'Computer Vision and Pattern Recognition',
      pdf_url: 'https://arxiv.org/pdf/2602.04567v1',
    });

    expect(papers[1]).toEqual({
      arxiv_id: '2601.12345v1',
      title: 'SAM2-UNet: Segment Anything 2 for segmentation',
      cited_by_count: 31,
      publication_date: '2026-01-13',
      authors: ['Xinyu Xiong'],
      subfield: 'Radiology',
      pdf_url: 'https://arxiv.org/pdf/2601.12345v1',
    });
  });

  it('truncates authors to 5', () => {
    const result = [{
      ...sampleOpenAlexResults[0],
      authorships: [
        { author: { display_name: 'A1' } },
        { author: { display_name: 'A2' } },
        { author: { display_name: 'A3' } },
        { author: { display_name: 'A4' } },
        { author: { display_name: 'A5' } },
        { author: { display_name: 'A6' } },
        { author: { display_name: 'A7' } },
      ],
    }];
    const papers = parseOpenAlexResponse(result);
    expect(papers[0].authors).toHaveLength(5);
    expect(papers[0].authors).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });

  it('handles missing optional fields gracefully', () => {
    const result = [{
      title: 'Test Paper',
      cited_by_count: 10,
      publication_date: '2026-03-01',
      authorships: [],
      primary_topic: null,
      primary_location: {
        landing_page_url: 'https://arxiv.org/abs/2603.99999v1',
      },
    }];
    const papers = parseOpenAlexResponse(result);
    expect(papers).toHaveLength(1);
    expect(papers[0].authors).toEqual([]);
    expect(papers[0].subfield).toBe('');
  });

  it('returns empty array for empty results', () => {
    const papers = parseOpenAlexResponse([]);
    expect(papers).toEqual([]);
  });
});

describe('formatRankingToTsv', () => {
  it('converts ranked papers to TSV with rank column', () => {
    const papers = parseOpenAlexResponse(sampleOpenAlexResults);
    const tsv = formatRankingToTsv(papers);
    const lines = tsv.split('\n');

    expect(lines[0]).toBe('rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url');
    expect(lines[1]).toContain('1\t84\t2602.04567v1');
    expect(lines[1]).toContain('Xin Zhang; Chen Liu');
    expect(lines[2]).toContain('2\t31\t2601.12345v1');
    expect(lines).toHaveLength(3);
  });

  it('returns header only for empty array', () => {
    const tsv = formatRankingToTsv([]);
    expect(tsv).toBe('rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url');
  });
});

describe('parseWrittenList', () => {
  it('parses written TSV into Set of IDs', () => {
    const tsv = 'arxiv_id\twritten_date\n2603.12345v1\t2026-04-01\n2603.12346v1\t2026-04-02';
    const ids = parseWrittenList(tsv);
    expect(ids.size).toBe(2);
    expect(ids.has('2603.12345v1')).toBe(true);
    expect(ids.has('2603.12346v1')).toBe(true);
  });

  it('returns empty set for empty TSV', () => {
    expect(parseWrittenList('').size).toBe(0);
  });

  it('returns empty set for header only', () => {
    expect(parseWrittenList('arxiv_id\twritten_date').size).toBe(0);
  });

  it('空行が含まれる場合スキップする（id が空文字）', () => {
    const tsv = 'arxiv_id\twritten_date\n2603.12345v1\t2026-04-01\n\n2603.12346v1\t2026-04-02\n';
    const ids = parseWrittenList(tsv);
    expect(ids.size).toBe(2);
    expect(ids.has('')).toBe(false);
  });

  it('タブが無い行でも先頭を id として扱うが空白のみなら追加しない', () => {
    const tsv = 'arxiv_id\twritten_date\n   \n2603.99999v1';
    const ids = parseWrittenList(tsv);
    expect(ids.has('2603.99999v1')).toBe(true);
    // 空白のみ行は trim 後に '' → falsy → 追加されない
    expect(ids.size).toBe(1);
  });
});

describe('addToWrittenList', () => {
  it('creates new list from empty', () => {
    const result = addToWrittenList('', '2603.12345v1', '2026-04-01');
    expect(result).toBe('arxiv_id\twritten_date\n2603.12345v1\t2026-04-01');
  });

  it('appends to existing list', () => {
    const existing = 'arxiv_id\twritten_date\n2603.12345v1\t2026-04-01';
    const result = addToWrittenList(existing, '2603.12346v1', '2026-04-02');
    expect(result).toBe('arxiv_id\twritten_date\n2603.12345v1\t2026-04-01\n2603.12346v1\t2026-04-02');
  });

  it('handles header-only list', () => {
    const result = addToWrittenList('arxiv_id\twritten_date', '2603.12345v1', '2026-04-01');
    expect(result).toBe('arxiv_id\twritten_date\n2603.12345v1\t2026-04-01');
  });
});

describe('parseOpenAlexResponse - edge cases', () => {
  it('primary_location が null の場合はスキップする', () => {
    const results = [
      {
        title: 'No Location Paper',
        cited_by_count: 10,
        publication_date: '2026-03-01',
        authorships: [{ author: { display_name: 'Author One' } }],
        primary_topic: { subfield: { display_name: 'CS' } },
        primary_location: null,
      },
    ];
    const papers = parseOpenAlexResponse(results);
    expect(papers).toHaveLength(0);
  });

  it('landing_page_url が arXiv でない場合はスキップする', () => {
    const results = [
      {
        title: 'Non-arXiv Paper',
        cited_by_count: 5,
        publication_date: '2026-03-01',
        authorships: [{ author: { display_name: 'Author X' } }],
        primary_topic: { subfield: { display_name: 'Biology' } },
        primary_location: {
          landing_page_url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
        },
      },
    ];
    const papers = parseOpenAlexResponse(results);
    expect(papers).toHaveLength(0);
  });

  it('arXiv 論文と非arXiv 論文が混在する場合、arXiv のみ返す', () => {
    const results = [
      {
        title: 'arXiv Paper',
        cited_by_count: 20,
        publication_date: '2026-03-01',
        authorships: [{ author: { display_name: 'Author A' } }],
        primary_topic: { subfield: { display_name: 'ML' } },
        primary_location: { landing_page_url: 'https://arxiv.org/abs/2603.11111v1' },
      },
      {
        title: 'Non-arXiv Paper',
        cited_by_count: 50,
        publication_date: '2026-03-01',
        authorships: [],
        primary_topic: null,
        primary_location: { landing_page_url: 'https://doi.org/10.1234/something' },
      },
    ];
    const papers = parseOpenAlexResponse(results);
    expect(papers).toHaveLength(1);
    expect(papers[0].arxiv_id).toBe('2603.11111v1');
  });

  it('title にタブ・改行が含まれる場合 TSV で空白に置換される', () => {
    const papers = [{
      arxiv_id: '2603.00001v1',
      title: 'Title\twith\ttab\nand\nnewline',
      cited_by_count: 1,
      publication_date: '2026-03-01',
      authors: ['Author A'],
      subfield: 'CS',
      pdf_url: 'https://arxiv.org/pdf/2603.00001v1',
    }];
    const tsv = formatRankingToTsv(papers);
    const dataLine = tsv.split('\n')[1];
    expect(dataLine).not.toContain('\t\t');
    // タブ/改行は空白に置換されているので、フィールド境界が壊れていない
    const fields = dataLine.split('\t');
    expect(fields).toHaveLength(8);
    expect(fields[6]).toBe('Title with tab and newline');
  });

  it('authors にタブが含まれる場合 TSV で空白に置換される', () => {
    const papers = [{
      arxiv_id: '2603.00002v1',
      title: 'Normal Title',
      cited_by_count: 1,
      publication_date: '2026-03-01',
      authors: ['Author\tWith\tTab'],
      subfield: 'CS',
      pdf_url: 'https://arxiv.org/pdf/2603.00002v1',
    }];
    const tsv = formatRankingToTsv(papers);
    const dataLine = tsv.split('\n')[1];
    const fields = dataLine.split('\t');
    expect(fields[5]).toBe('Author With Tab');
  });
});

describe('fetchRankingFromOpenAlex', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('API エラー時に Error をスローする', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }) as unknown as typeof fetch;

    const { fetchRankingFromOpenAlex } = await import('../paperRankingCollector');
    await expect(
      fetchRankingFromOpenAlex(3, 10, '2026-04-15', 'test@example.com'),
    ).rejects.toThrow('OpenAlex API error: 429 Too Many Requests');
  });

  it('正常レスポンス時に RankedPaper[] を返す', async () => {
    const mockResults = [
      {
        title: 'Test Paper',
        cited_by_count: 10,
        publication_date: '2026-03-01',
        authorships: [{ author: { display_name: 'Test Author' } }],
        primary_topic: { subfield: { display_name: 'CS' } },
        primary_location: { landing_page_url: 'https://arxiv.org/abs/2603.99999v1' },
      },
    ];
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: mockResults }),
    }) as unknown as typeof fetch;

    const { fetchRankingFromOpenAlex } = await import('../paperRankingCollector');
    const papers = await fetchRankingFromOpenAlex(3, 5, '2026-04-15', 'test@example.com');
    expect(papers).toHaveLength(1);
    expect(papers[0].arxiv_id).toBe('2603.99999v1');
  });
});
