import { LanguageRegistry } from '../LanguageRegistry';
import type { LanguageAnalyzer } from '../LanguageAnalyzer';

const makeStub = (id: string, detectResult: boolean): LanguageAnalyzer => ({
  id,
  detect: () => detectResult,
  analyze: () => ({
    nodes: [],
    edges: [],
    metadata: { projectRoot: '/x', analyzedAt: '2026-05-24T00:00:00.000Z', fileCount: 0 },
  }),
});

describe('LanguageRegistry', () => {
  it('registers and resolves an analyzer by id', () => {
    const reg = new LanguageRegistry();
    const ts = makeStub('typescript', true);
    reg.register(ts);
    expect(reg.get('typescript')).toBe(ts);
    expect(reg.list().map((a) => a.id)).toEqual(['typescript']);
  });

  it('detectAll returns only analyzers whose detect() is true', () => {
    const reg = new LanguageRegistry();
    reg.register(makeStub('typescript', true));
    reg.register(makeStub('python', false));
    expect(reg.detectAll('/repo').map((a) => a.id)).toEqual(['typescript']);
  });

  it('throws on duplicate id registration', () => {
    const reg = new LanguageRegistry();
    reg.register(makeStub('typescript', true));
    expect(() => reg.register(makeStub('typescript', true))).toThrow(/already registered/);
  });
});
