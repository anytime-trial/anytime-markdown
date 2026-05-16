import { gitExec, GitExecError } from '../gitExec';

describe('gitExec', () => {
  it('returns stdout for a successful git command', async () => {
    const result = await gitExec(['--version']);
    expect(result.stdout).toMatch(/^git version /);
    expect(result.stderr).toBe('');
  });

  it('throws GitExecError with stderr/exitCode/cwd on failure', async () => {
    await expect(gitExec(['rev-parse', '--git-dir'], { cwd: '/tmp' }))
      .rejects.toMatchObject({
        name: 'GitExecError',
        cwd: '/tmp',
        exitCode: 128,
      });
  });

  it('honors cwd option', async () => {
    const result = await gitExec(['rev-parse', '--show-toplevel'], { cwd: process.cwd() });
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });
});
