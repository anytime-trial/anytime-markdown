import { formatReleaseStepDisplay } from '../releaseStepDisplay';

describe('release step display', () => {
  it('formats total steps and added/deleted breakdown', () => {
    expect(formatReleaseStepDisplay({ linesAdded: 12345, linesDeleted: 678 })).toEqual({
      total: '13,023',
      breakdown: '(+12,345/-678)',
    });
  });
});
