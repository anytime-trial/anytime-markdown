import {
  buildOpenAlexUrl,
  parseOpenAlexResponse,
  formatRankingToJsonl,
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
    const url = buildOpenAlexUrl(1, 20, '2026-04-01');
    expect(url).toContain('https://api.openalex.org/works');
    expect(url).toContain('from_publication_date:2026-03-01');
    expect(url).toContain('to_publication_date:2026-04-01');
    expect(url).toContain('locations.source.id:S4306400194');
    expect(url).toContain('sort=cited_by_count:desc');
    expect(url).toContain('per_page=20');
    expect(url).toContain('mailto=noreply@example.com');
  });

  it('computes 3-month lookback correctly', () => {
    const url = buildOpenAlexUrl(3, 10, '2026-04-01');
    expect(url).toContain('from_publication_date:2026-01-01');
    expect(url).toContain('to_publication_date:2026-04-01');
    expect(url).toContain('per_page=10');
  });

  it('handles year boundary for lookback', () => {
    const url = buildOpenAlexUrl(3, 20, '2026-02-15');
    expect(url).toContain('from_publication_date:2025-11-15');
    expect(url).toContain('to_publication_date:2026-02-15');
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

describe('formatRankingToJsonl', () => {
  it('converts ranked papers to JSONL format', () => {
    const papers = parseOpenAlexResponse(sampleOpenAlexResults);
    const jsonl = formatRankingToJsonl(papers);
    const lines = jsonl.split('\n');

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.arxiv_id).toBe('2602.04567v1');
    expect(first.cited_by_count).toBe(84);
    expect(first.title).toBe('RFAConv: Receptive-field attention convolution');

    const second = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(second.arxiv_id).toBe('2601.12345v1');
    expect(second.cited_by_count).toBe(31);
  });

  it('returns empty string for empty array', () => {
    expect(formatRankingToJsonl([])).toBe('');
  });
});
