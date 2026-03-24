import { escapeXml, toHexColor } from '../../io/utils';

describe('escapeXml', () => {
  it('should escape &, <, >, "', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });
  it('should return unchanged string without special chars', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });
  it('should handle empty string', () => {
    expect(escapeXml('')).toBe('');
  });
  it('should handle multiple consecutive special chars', () => {
    expect(escapeXml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });
});

describe('toHexColor', () => {
  it('should pass through hex colors', () => {
    expect(toHexColor('#FF0000')).toBe('#FF0000');
  });
  it('should convert rgb to hex', () => {
    expect(toHexColor('rgb(255, 0, 0)')).toBe('#FF0000');
  });
  it('should convert rgba to hex (alpha ignored)', () => {
    expect(toHexColor('rgba(255, 255, 255, 0.5)')).toBe('#FFFFFF');
  });
  it('should convert rgb(0,0,0) to #000000', () => {
    expect(toHexColor('rgb(0, 0, 0)')).toBe('#000000');
  });
  it('should return original for unrecognized formats', () => {
    expect(toHexColor('transparent')).toBe('transparent');
  });
});
