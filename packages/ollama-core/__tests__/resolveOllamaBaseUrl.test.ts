// isInsideContainer() reads fs.existsSync('/.dockerenv'); mock it so the
// auto-detection branch is deterministic regardless of the test host.
jest.mock('node:fs', () => ({ existsSync: jest.fn(() => false) }));

import { existsSync } from 'node:fs';

import { DEFAULT_OLLAMA_BASE_URL, resolveOllamaBaseUrl } from '../src/client';

const mockExistsSync = existsSync as unknown as jest.Mock;

describe('resolveOllamaBaseUrl', () => {
  const original = process.env.OLLAMA_BASE_URL;
  beforeEach(() => {
    mockExistsSync.mockReturnValue(false); // not a container by default
  });
  afterEach(() => {
    if (original === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = original;
  });

  it('prefers OLLAMA_BASE_URL env over config', () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9999';
    expect(resolveOllamaBaseUrl('http://host.docker.internal:11434')).toBe('http://127.0.0.1:9999');
  });

  it('uses an explicit non-default config value when env is unset', () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(resolveOllamaBaseUrl('http://host.docker.internal:11434')).toBe(
      'http://host.docker.internal:11434',
    );
  });

  it('treats the plain default config value as "unset" (host fallback when not container)', () => {
    delete process.env.OLLAMA_BASE_URL;
    mockExistsSync.mockReturnValue(false);
    expect(resolveOllamaBaseUrl(DEFAULT_OLLAMA_BASE_URL)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('falls back to localhost when neither env nor config is set (not container)', () => {
    delete process.env.OLLAMA_BASE_URL;
    mockExistsSync.mockReturnValue(false);
    expect(resolveOllamaBaseUrl(undefined)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('falls back to host.docker.internal inside a Dev Container', () => {
    delete process.env.OLLAMA_BASE_URL;
    mockExistsSync.mockReturnValue(true); // /.dockerenv present
    expect(resolveOllamaBaseUrl(undefined)).toBe('http://host.docker.internal:11434');
  });
});
