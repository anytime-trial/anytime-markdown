// The moduleNameMapper in jest.config.js maps 'vscode' → __mocks__/vscode.ts
// Set up mock BEFORE importing GitLogger so the channel is captured
const mockAppendLine = jest.fn();
const mockDispose = jest.fn();

jest.mock('vscode', () => ({
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: mockAppendLine,
      dispose: mockDispose,
    })),
  },
}));

import { GitLogger } from '../GitLogger';

describe('GitLogger', () => {
  beforeEach(() => {
    // Dispose so the channel is recreated fresh for each test
    GitLogger.dispose();
    mockAppendLine.mockClear();
    mockDispose.mockClear();
  });

  afterEach(() => {
    GitLogger.dispose();
  });

  it('info() calls appendLine with [INFO] prefix', () => {
    GitLogger.info('test info message');
    expect(mockAppendLine).toHaveBeenCalledWith('[INFO] test info message');
  });

  it('warn() calls appendLine with [WARN] prefix', () => {
    GitLogger.warn('test warning');
    expect(mockAppendLine).toHaveBeenCalledWith('[WARN] test warning');
  });

  it('error() calls appendLine with [ERROR] prefix', () => {
    GitLogger.error('something failed');
    expect(mockAppendLine).toHaveBeenCalledWith('[ERROR] something failed');
  });

  it('error() includes error message when Error passed', () => {
    GitLogger.error('operation failed', new Error('file not found'));
    expect(mockAppendLine).toHaveBeenCalledWith('[ERROR] operation failed: file not found');
  });

  it('error() handles non-Error thrown values (no detail suffix)', () => {
    GitLogger.error('op', 'string error');
    // non-Error: detail is '' so no colon suffix
    expect(mockAppendLine).toHaveBeenCalledWith('[ERROR] op');
  });

  it('debugSql() does not call appendLine', () => {
    GitLogger.debugSql({ sql: 'SELECT 1', params: [] });
    expect(mockAppendLine).not.toHaveBeenCalled();
  });

  it('reuses the same channel across multiple calls', () => {
    const vscode = jest.requireMock('vscode') as { window: { createOutputChannel: jest.Mock } };
    vscode.window.createOutputChannel.mockClear();

    GitLogger.info('msg1');
    GitLogger.info('msg2');
    // Channel should be created only once
    expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
    expect(mockAppendLine).toHaveBeenCalledTimes(2);
  });

  it('dispose() calls channel.dispose() and clears reference', () => {
    GitLogger.info('before dispose');
    GitLogger.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('dispose() on uninitialized channel is a no-op', () => {
    // channel was already disposed in beforeEach — second dispose is safe
    expect(() => GitLogger.dispose()).not.toThrow();
    expect(mockDispose).not.toHaveBeenCalled();
  });
});
