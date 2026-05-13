import { createPeriodicImportJob } from '../PeriodicImportJob';

describe('createPeriodicImportJob', () => {
  it('returns a job that calls trailDb.importAll with gitRoots', async () => {
    const importAll = jest.fn(async () => ({
      imported: 3, skipped: 1, commitsResolved: 5, releasesResolved: 0,
      releasesAnalyzed: 0, coverageImported: 0, currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    }));
    const trailDb = { importAll } as unknown as Parameters<typeof createPeriodicImportJob>[0]['trailDb'];

    const job = createPeriodicImportJob({
      trailDb,
      gitRoots: ['/a', '/b'],
      intervalMs: 60_000,
      runOnStart: true,
      startupDelayMs: 5_000,
    });

    expect(job.id).toBe('periodic-import');
    expect(job.intervalMs).toBe(60_000);
    expect(job.runOnStart).toBe(true);
    expect(job.startupDelayMs).toBe(5_000);

    const result = await job.run();
    expect(importAll).toHaveBeenCalledTimes(1);
    const firstCall = importAll.mock.calls[0] as unknown[];
    expect(firstCall[1]).toEqual(['/a', '/b']);
    expect(result.status).toBe('ok');
    expect(result.metrics?.imported).toBe(3);
    expect(result.metrics?.commitsResolved).toBe(5);
  });

  it('returns error status when importAll throws', async () => {
    const trailDb = {
      importAll: jest.fn(async () => { throw new Error('disk full'); }),
    } as unknown as Parameters<typeof createPeriodicImportJob>[0]['trailDb'];

    const job = createPeriodicImportJob({
      trailDb,
      gitRoots: [],
      intervalMs: 60_000,
      runOnStart: false,
      startupDelayMs: 0,
    });

    await expect(job.run()).rejects.toThrow('disk full');
  });
});
