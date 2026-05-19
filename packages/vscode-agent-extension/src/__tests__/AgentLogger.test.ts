import * as vscode from 'vscode';

import { AgentLogger } from '../utils/AgentLogger';

interface MockChannel {
  appendLine: jest.Mock;
  dispose: jest.Mock;
}

const createOutputChannelMock = vscode.window.createOutputChannel as jest.Mock;

describe('AgentLogger', () => {
  let channel: MockChannel;

  beforeEach(() => {
    channel = { appendLine: jest.fn(), dispose: jest.fn() };
    createOutputChannelMock.mockReset();
    createOutputChannelMock.mockReturnValue(channel);
    AgentLogger.dispose();
  });

  afterEach(() => {
    AgentLogger.dispose();
  });

  test('info writes INFO line with ISO timestamp', () => {
    AgentLogger.info('hello world');
    expect(createOutputChannelMock).toHaveBeenCalledWith('Anytime Agent');
    expect(channel.appendLine).toHaveBeenCalledTimes(1);
    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] hello world$/);
  });

  test('warn writes WARN line', () => {
    AgentLogger.warn('careful');
    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toContain('[WARN] careful');
  });

  test('error without err writes ERROR line only', () => {
    AgentLogger.error('failed');
    expect(channel.appendLine).toHaveBeenCalledTimes(1);
    const line: string = channel.appendLine.mock.calls[0][0];
    expect(line).toMatch(/\[ERROR\] failed$/);
  });

  test('error with Error appends message and stack', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at fn (file.ts:1)';
    AgentLogger.error('something failed', err);
    expect(channel.appendLine).toHaveBeenCalledTimes(2);
    expect(channel.appendLine.mock.calls[0][0]).toContain('something failed: boom');
    expect(channel.appendLine.mock.calls[1][0]).toContain('Error: boom');
  });

  test('error with non-Error stringifies', () => {
    AgentLogger.error('bad', 'string-error');
    expect(channel.appendLine).toHaveBeenCalledTimes(1);
    expect(channel.appendLine.mock.calls[0][0]).toContain('bad: string-error');
  });

  test('error with falsy err skips detail and stack', () => {
    AgentLogger.error('bare');
    expect(channel.appendLine).toHaveBeenCalledTimes(1);
    expect(channel.appendLine.mock.calls[0][0]).toMatch(/\[ERROR\] bare$/);
  });

  test('reuses existing channel across calls (singleton)', () => {
    AgentLogger.info('first');
    AgentLogger.info('second');
    expect(createOutputChannelMock).toHaveBeenCalledTimes(1);
    expect(channel.appendLine).toHaveBeenCalledTimes(2);
  });

  test('dispose tears down the channel and clears the cached instance', () => {
    AgentLogger.info('init');
    AgentLogger.dispose();
    expect(channel.dispose).toHaveBeenCalled();
    // Next call creates a new channel
    const channel2: MockChannel = { appendLine: jest.fn(), dispose: jest.fn() };
    createOutputChannelMock.mockReturnValue(channel2);
    AgentLogger.info('after dispose');
    expect(channel2.appendLine).toHaveBeenCalled();
    expect(createOutputChannelMock).toHaveBeenCalledTimes(2);
  });

  test('dispose is safe when no channel exists', () => {
    AgentLogger.dispose();
    expect(channel.dispose).not.toHaveBeenCalled();
  });
});
