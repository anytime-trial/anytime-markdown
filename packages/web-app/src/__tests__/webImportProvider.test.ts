import { buildMarkdownDownloadName, createWebImportProvider } from '../lib/webImportProvider';

describe('buildMarkdownDownloadName', () => {
  it.each([
    ['Hello World', 'hello-world.md'],
    ['  A/B: C?  ', 'a-b-c.md'],
    ['', 'web-import.md'],
    ['---', 'web-import.md'],
    ['Café au lait', 'cafe-au-lait.md'],
  ])('normalizes %p', (title, expected) => {
    expect(buildMarkdownDownloadName(title)).toBe(expected);
  });
});

describe('createWebImportProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null when base URL is empty', () => {
    expect(createWebImportProvider('')).toBeNull();
  });

  it('fetches through the configured proxy', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html: '<html></html>', finalUrl: 'https://example.com/', contentType: 'text/html' }),
    });

    const provider = createWebImportProvider('https://proxy.example.com/')!;
    await expect(provider.fetch('https://example.com/a?b=c')).resolves.toEqual({
      html: '<html></html>',
      finalUrl: 'https://example.com/',
      contentType: 'text/html',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://proxy.example.com/fetch?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc',
      { method: 'GET' },
    );
  });
});
