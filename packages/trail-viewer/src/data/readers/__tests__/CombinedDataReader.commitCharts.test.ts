import { CombinedDataReader } from '../CombinedDataReader';

type QueryResult = {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error?: Error | null;
};

function chain(resolveResult: (selectArg: string) => QueryResult) {
  let selectArg = '';
  const obj: Record<string, unknown> = {};
  for (const method of ['eq', 'gte', 'gt', 'in', 'lt', 'lte', 'not', 'order', 'range', 'select']) {
    obj[method] = (...args: unknown[]) => {
      if (method === 'select') selectArg = String(args[0] ?? '');
      return obj;
    };
  }
  obj.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve(resolveResult(selectArg)));
  return obj;
}

function makeClient() {
  return {
    from(table: string) {
      if (table === 'trail_daily_counts') return chain(() => ({ data: [] }));
      if (table === 'trail_sessions') {
        return chain(() => ({
          data: [{
            id: 's1',
            source: 'codex',
            start_time: '2026-05-01T00:00:00.000Z',
            repo_name: 'anytime-markdown',
          }],
        }));
      }
      if (table === 'trail_session_costs') {
        return chain(() => ({
          data: [{
            session_id: 's1',
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            estimated_cost_usd: 0,
          }],
        }));
      }
      if (table === 'trail_session_commits') {
        return chain((selectArg) => {
          if (selectArg.includes('commit_message')) {
            return { data: null, error: new Error('column trail_session_commits.commit_message does not exist') };
          }
          if (selectArg.includes('subject')) {
            return {
              data: [{
                repo_name: 'anytime-markdown',
                commit_hash: 'abc123',
                subject: 'fix(web): restore activity charts',
                committed_at: '2026-05-01T01:00:00.000Z',
                lines_added: 12,
              }],
            };
          }
          return {
            data: [{
              session_id: 's1',
              committed_at: '2026-05-01T01:00:00.000Z',
              lines_added: 12,
            }],
          };
        });
      }
      return chain(() => ({ data: [] }));
    },
  };
}

describe('CombinedDataReader.getCombinedData commit chart stats', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('uses legacy subject commit rows when commit_message is unavailable', async () => {
    const reader = new CombinedDataReader(makeClient() as never);

    const data = await reader.getCombinedData('day', 30);

    expect(data?.commitPrefixStats).toEqual([{
      period: '2026-05-01',
      prefix: 'fix',
      count: 1,
      linesAdded: 12,
      linesDeleted: 0,
    }]);
    expect(data?.repoStats).toEqual([{
      period: '2026-05-01',
      repoName: 'anytime-markdown',
      count: 1,
      tokens: 150,
    }]);
  });
});
