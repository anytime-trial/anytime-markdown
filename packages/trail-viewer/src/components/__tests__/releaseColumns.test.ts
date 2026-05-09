import { getReleaseTableColumns } from '../releaseColumns';

describe('release table columns', () => {
  it('does not include steps per day and packages columns', () => {
    expect(getReleaseTableColumns().map((column) => column.key)).toEqual([
      'version',
      'date',
      'interval',
      'totalSteps',
      'steps',
      'files',
      'commits',
      'breakdown',
      'fixRate',
    ]);
  });
});
