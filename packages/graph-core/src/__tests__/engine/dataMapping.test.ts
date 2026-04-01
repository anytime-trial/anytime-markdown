import { linearScale, interpolateColor } from '../../engine/dataMapping';

describe('linearScale', () => {
  it('should map value to output range', () => {
    const scale = linearScale(0, 100, 60, 200);
    expect(scale(0)).toBe(60);
    expect(scale(100)).toBe(200);
    expect(scale(50)).toBe(130);
  });

  it('should clamp values outside domain', () => {
    const scale = linearScale(0, 100, 60, 200);
    expect(scale(-10)).toBe(60);
    expect(scale(150)).toBe(200);
  });

  it('should handle equal min/max (return midpoint)', () => {
    const scale = linearScale(50, 50, 60, 200);
    expect(scale(50)).toBe(130);
  });
});

describe('interpolateColor', () => {
  it('should return colorA at t=0', () => {
    expect(interpolateColor('#000000', '#ffffff', 0)).toBe('#000000');
  });

  it('should return colorB at t=1', () => {
    expect(interpolateColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('should interpolate at t=0.5', () => {
    const result = interpolateColor('#000000', '#ffffff', 0.5);
    // Each channel should be ~128 (0x80)
    expect(result).toBe('#808080');
  });

  it('should clamp t to [0, 1]', () => {
    expect(interpolateColor('#000000', '#ffffff', -0.5)).toBe('#000000');
    expect(interpolateColor('#000000', '#ffffff', 1.5)).toBe('#ffffff');
  });

  it('should interpolate specific colors', () => {
    // #c6dbef to #08519c at t=0
    expect(interpolateColor('#c6dbef', '#08519c', 0)).toBe('#c6dbef');
    // at t=1
    expect(interpolateColor('#c6dbef', '#08519c', 1)).toBe('#08519c');
  });
});
