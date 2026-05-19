import { resolveSupabaseEnv } from '../../lib/supabase-env';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('resolveSupabaseEnv', () => {
  it('returns null when neither URL env var is set', () => {
    expect(resolveSupabaseEnv()).toBeNull();
  });

  it('returns null when URL is set but key is missing', () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    expect(resolveSupabaseEnv()).toBeNull();
  });

  it('returns null when key is set but URL is missing', () => {
    process.env.SUPABASE_ANON_KEY = 'key123';
    expect(resolveSupabaseEnv()).toBeNull();
  });

  it('returns env when both SUPABASE_URL and SUPABASE_ANON_KEY are set', () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    const result = resolveSupabaseEnv();
    expect(result).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon-key' });
  });

  it('falls back to NEXT_PUBLIC_ variants', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pub.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'pub-anon-key';
    const result = resolveSupabaseEnv();
    expect(result).toEqual({ url: 'https://pub.supabase.co', anonKey: 'pub-anon-key' });
  });

  it('prefers SUPABASE_URL over NEXT_PUBLIC_SUPABASE_URL', () => {
    process.env.SUPABASE_URL = 'https://private.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pub.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'private-key';
    const result = resolveSupabaseEnv();
    expect(result?.url).toBe('https://private.supabase.co');
  });
});
