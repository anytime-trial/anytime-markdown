import { DEFAULT_LEP_CONFIG, mergeLepConfig, validateLepConfigInput } from '../LepConfig';

describe('LepConfig throttle', () => {
  it('defaults to disabled with the agreed values', () => {
    expect(DEFAULT_LEP_CONFIG.throttle).toEqual({
      enabled: false,
      slowdownFactor: 1.5,
      cooldownSec: 30,
      maxContinuousMin: 15,
    });
  });

  it('parses a partial throttle block without warnings', () => {
    const { value, warnings } = validateLepConfigInput({ throttle: { enabled: true, cooldownSec: 45 } }, 'test');
    expect(warnings).toEqual([]);
    expect(value.throttle).toEqual({ enabled: true, cooldownSec: 45 });
  });

  it('merges throttle override over base (unset keys keep base defaults)', () => {
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, { throttle: { enabled: true, cooldownSec: 45 } });
    expect(merged.throttle).toEqual({
      enabled: true,
      slowdownFactor: 1.5,
      cooldownSec: 45,
      maxContinuousMin: 15,
    });
  });

  it('does not warn about throttle being an unknown top-level key', () => {
    const { warnings } = validateLepConfigInput({ throttle: {} }, 'test');
    expect(warnings).toEqual([]);
  });
});
