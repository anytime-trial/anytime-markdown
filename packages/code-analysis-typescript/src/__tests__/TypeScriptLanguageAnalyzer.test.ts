import path from 'node:path';
import { TypeScriptLanguageAnalyzer } from '../TypeScriptLanguageAnalyzer';
import { analyze } from '../analyze';

const FIXTURE_ROOT = path.join(__dirname, '..', 'analyzer', '__tests__', 'fixtures');
const TSCONFIG = path.join(FIXTURE_ROOT, 'tsconfig.json');

describe('TypeScriptLanguageAnalyzer', () => {
  const subject = new TypeScriptLanguageAnalyzer();

  it('has id "typescript"', () => {
    expect(subject.id).toBe('typescript');
  });

  it('detect() is true when tsconfig.json exists at repoRoot', () => {
    expect(subject.detect(FIXTURE_ROOT)).toBe(true);
  });

  it('detect() is false when no tsconfig.json exists', () => {
    expect(subject.detect(path.join(FIXTURE_ROOT, 'src'))).toBe(false);
  });

  it('analyze() produces the same graph as analyze() with explicit tsconfigPath', () => {
    const viaSpi = subject.analyze({ projectRoot: FIXTURE_ROOT, configPath: TSCONFIG });
    const viaDirect = analyze({ tsconfigPath: TSCONFIG });
    expect(viaSpi.nodes).toEqual(viaDirect.nodes);
    expect(viaSpi.edges).toEqual(viaDirect.edges);
  });
});
