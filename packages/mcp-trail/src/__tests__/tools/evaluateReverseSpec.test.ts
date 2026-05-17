import { handleEvaluateReverseSpec } from '../../tools/evaluateReverseSpec';

jest.mock('@anytime-markdown/markdown-eval-core', () => ({
  evaluateReverseSpec: jest.fn(),
}));

describe('handleEvaluateReverseSpec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates to markdown-eval-core.evaluateReverseSpec with full input', async () => {
    const { evaluateReverseSpec: mockEval } = jest.requireMock(
      '@anytime-markdown/markdown-eval-core',
    );
    const stubOutput = {
      pairs: [],
      unmatched: { reference: [], candidate: [] },
      meta: {
        golden_count: 0,
        candidate_count: 0,
        document_glob: '**/*.ja.md',
        exclude_globs: ['_eval/**'],
        max_excerpt_chars: 15000,
      },
    };
    mockEval.mockResolvedValue(stubOutput);

    const input = {
      goldenFiles: [{ relativePath: '01.ja.md', content: '# title' }],
      candidateDir: '/tmp/candidate',
      documentGlob: '**/*.ja.md',
      excludeGlobs: ['_eval/**'],
      maxExcerptChars: 15000,
    };
    const result = await handleEvaluateReverseSpec(input);

    expect(mockEval).toHaveBeenCalledTimes(1);
    expect(mockEval).toHaveBeenCalledWith(input);
    expect(result).toBe(stubOutput);
  });

  test('passes through with only required fields (optional defaults handled downstream)', async () => {
    const { evaluateReverseSpec: mockEval } = jest.requireMock(
      '@anytime-markdown/markdown-eval-core',
    );
    mockEval.mockResolvedValue({
      pairs: [],
      unmatched: { reference: [], candidate: [] },
      meta: {
        golden_count: 0,
        candidate_count: 0,
        document_glob: '**/*.ja.md',
        exclude_globs: ['_eval/**'],
        max_excerpt_chars: 15000,
      },
    });

    await handleEvaluateReverseSpec({
      goldenFiles: [],
      candidateDir: '/tmp/x',
    });

    expect(mockEval).toHaveBeenCalledWith({
      goldenFiles: [],
      candidateDir: '/tmp/x',
    });
  });
});
