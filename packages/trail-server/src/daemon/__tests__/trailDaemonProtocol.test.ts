import type { HostMessage, DaemonMessage } from '../trailDaemonProtocol';

describe('trailDaemonProtocol JSON round-trip', () => {
  it('configure リクエストが JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r1',
      method: 'configure',
      params: {
        trailDbPath: '/a',
        gitRoot: '/b',
        stage: 'primary+memory',
        ollamaBaseUrl: 'http://l',
        importAllStatusFilePath: '/i',
        pipelineStatusFilePath: '/p',
        memoryCore: null,
      },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('log イベントが JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'log',
      payload: { level: 'info', message: 'x', timestamp: '2026-05-28T00:00:00.000Z' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('error response が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r1',
      ok: false,
      error: { message: 'e' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('success response (result 付き) が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r2',
      ok: true,
      result: { status: 'idle' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });
});
