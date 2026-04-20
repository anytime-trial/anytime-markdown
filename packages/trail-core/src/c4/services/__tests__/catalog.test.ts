import { findService, filterServices, SERVICE_CATALOG } from '../catalog';

describe('catalog', () => {
  it('findService("supabase") returns correct entry', () => {
    const entry = findService('supabase');
    expect(entry).toBeDefined();
    expect(entry!.label).toBe('Supabase');
    expect(entry!.category).toBe('Database');
    expect(entry!.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(entry!.iconPath ?? entry!.iconBody).toBeTruthy();
  });

  it('findService with unknown id returns undefined', () => {
    expect(findService('unknown_xyz')).toBeUndefined();
  });

  it('filterServices("supa") returns entries matching name', () => {
    const results = filterServices('supa');
    expect(results.some(e => e.id === 'supabase')).toBe(true);
  });

  it('filterServices by category "Hosting" returns netlify and vercel', () => {
    const results = filterServices('Hosting');
    expect(results.some(e => e.id === 'netlify')).toBe(true);
    expect(results.some(e => e.id === 'vercel')).toBe(true);
  });

  it('SERVICE_CATALOG has at least 20 entries', () => {
    expect(SERVICE_CATALOG.length).toBeGreaterThanOrEqual(20);
  });
});
