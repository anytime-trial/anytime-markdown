import {
  assertSafeFetchUrl,
  assertSafeRedirectUrl,
  isBlockedHost,
} from '../webFetchProxy';

describe('webFetchProxy URL safety', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'localhost',
    'app.local',
    'service.internal',
    'metadata.google.internal',
  ])('blocks private or metadata host %s', (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each([
    'example.com',
    'www.google.com',
    '93.184.216.34',
    '2606:2800:220:1:248:1893:25c8:1946',
  ])('allows public host %s', (host) => {
    expect(isBlockedHost(host)).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(() => assertSafeFetchUrl('file:///etc/passwd')).toThrow('unsupported_scheme');
  });

  it('rejects localhost URLs', () => {
    expect(() => assertSafeFetchUrl('https://localhost/page')).toThrow('blocked_host');
  });

  it('rejects private IP redirects', () => {
    expect(() => assertSafeRedirectUrl('/admin', 'https://127.0.0.1/start')).toThrow('blocked_host');
    expect(() => assertSafeRedirectUrl('http://10.0.0.5/private', 'https://example.com/start')).toThrow('blocked_host');
  });

  it('allows normal http and https URLs', () => {
    expect(assertSafeFetchUrl('https://example.com/article').hostname).toBe('example.com');
    expect(assertSafeFetchUrl('http://example.com/article').hostname).toBe('example.com');
  });
});
