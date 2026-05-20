/**
 * /api/weather (GET) のユニットテスト
 */

jest.mock('../lib/api-helpers', () => ({
  extractErrorMessage: jest.fn((e: unknown) => (e instanceof Error ? e.message : 'Unknown error')),
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  static json = jest.fn((body: unknown, init?: { status?: number }) => {
    const r = new MockNextResponse(body, init);
    return r;
  });
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET } from '../app/api/weather/route';

type MockResp = { _body: Record<string, unknown>; _status: number };

function makeWeatherResponse(code = 0, temp = 20, max = 25, min = 15) {
  return {
    current: { temperature_2m: temp, weather_code: code },
    daily: { temperature_2m_max: [max], temperature_2m_min: [min] },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/weather', () => {
  it('returns cities array with weather data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(makeWeatherResponse(0, 22, 27, 18)),
    });

    const result = (await GET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    const cities = result._body.cities as Record<string, unknown>[];
    expect(Array.isArray(cities)).toBe(true);
    expect(cities.length).toBeGreaterThan(0);
    // First city should be Tokyo
    expect(cities[0].key).toBe('tokyo');
    expect(cities[0].temp).toBe(22);
    expect(cities[0].tempMax).toBe(27);
    expect(cities[0].tempMin).toBe(18);
    expect(cities[0].conditionEn).toBe('CLEAR');
    expect(cities[0].conditionJa).toBe('晴れ');
  });

  it('maps WMO codes correctly', async () => {
    const codeMappings = [
      [1, 'PARTLY'],
      [3, 'CLOUDY'],
      [10, 'FOG'],
      [50, 'DRIZZLE'],
      [61, 'RAIN'],
      [71, 'SNOW'],
      [80, 'SHOWER'],
      [95, 'STORM'],
    ];

    for (const [code, expectedEn] of codeMappings) {
      jest.clearAllMocks();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(makeWeatherResponse(code as number, 20, 25, 15)),
      });

      const result = (await GET()) as unknown as MockResp;
      const cities = result._body.cities as Record<string, unknown>[];
      expect(cities[0].conditionEn).toBe(expectedEn);
    }
  });

  it('skips failed cities and returns partial results', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      if (callCount++ === 0) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue(makeWeatherResponse(0, 15, 20, 10)),
      });
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    const cities = result._body.cities as Record<string, unknown>[];
    // First city (tokyo) fails, rest succeed
    expect(cities.every((c) => c.key !== 'tokyo')).toBe(true);
    consoleSpy.mockRestore();
  });

  it('handles fetch throwing and returns partial results', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      if (callCount++ === 0) {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue(makeWeatherResponse(0, 10, 15, 5)),
      });
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    const cities = result._body.cities as Record<string, unknown>[];
    expect(cities.length).toBeLessThan(6); // 6 cities total but first failed
    consoleSpy.mockRestore();
  });

  it('returns empty cities when all fetches fail', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body.cities).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('rounds temperature values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        current: { temperature_2m: 22.7, weather_code: 0 },
        daily: { temperature_2m_max: [27.3], temperature_2m_min: [15.8] },
      }),
    });

    const result = (await GET()) as unknown as MockResp;
    const cities = result._body.cities as Record<string, unknown>[];
    expect(cities[0].temp).toBe(23);
    expect(cities[0].tempMax).toBe(27);
    expect(cities[0].tempMin).toBe(16);
  });

  it('falls back to current temp when daily array is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        current: { temperature_2m: 20, weather_code: 0 },
        daily: { temperature_2m_max: [], temperature_2m_min: [] },
      }),
    });

    const result = (await GET()) as unknown as MockResp;
    const cities = result._body.cities as Record<string, unknown>[];
    // Falls back to current temp
    expect(cities[0].tempMax).toBe(20);
    expect(cities[0].tempMin).toBe(20);
  });
});
