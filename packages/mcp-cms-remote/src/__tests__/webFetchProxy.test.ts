import {
  assertSafeFetchUrl,
  assertSafeRedirectUrl,
  isBlockedHost,
  resolveAllowedOrigin,
} from '../webFetchProxy';

describe('IPv4-mapped IPv6 SSRF', () => {
  it.each([
    '::ffff:127.0.0.1',
    '[::ffff:127.0.0.1]',
    '::ffff:7f00:1',
    '::ffff:192.168.0.1',
    '::ffff:169.254.169.254',
  ])('blocks mapped private %s', (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it('allows mapped public address', () => {
    expect(isBlockedHost('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('resolveAllowedOrigin', () => {
  it('returns * when no allowlist configured', () => {
    expect(resolveAllowedOrigin(undefined, 'https://app.example')).toBe('*');
    expect(resolveAllowedOrigin('', 'https://app.example')).toBe('*');
  });

  it('reflects an allowed origin and rejects others', () => {
    const config = 'https://app.example, https://www.example';
    expect(resolveAllowedOrigin(config, 'https://app.example')).toBe('https://app.example');
    expect(resolveAllowedOrigin(config, 'https://evil.example')).toBeNull();
    expect(resolveAllowedOrigin(config, undefined)).toBeNull();
  });
});

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
