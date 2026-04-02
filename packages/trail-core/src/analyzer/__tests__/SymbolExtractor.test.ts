import path from 'node:path';
import { ProjectAnalyzer } from '../ProjectAnalyzer';
import { SymbolExtractor } from '../SymbolExtractor';

const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('SymbolExtractor', () => {
  let extractor: SymbolExtractor;

  beforeAll(() => {
    const analyzer = new ProjectAnalyzer(
      path.join(FIXTURES, 'tsconfig.json'),
    );
    extractor = new SymbolExtractor(analyzer);
  });

  it('should extract file nodes', () => {
    const nodes = extractor.extract();
    const fileNodes = nodes.filter(n => n.type === 'file');
    const labels = fileNodes.map(n => n.label);
    expect(labels).toContain('index.ts');
    expect(labels).toContain('utils.ts');
  });

  it('should extract class nodes', () => {
    const nodes = extractor.extract();
    const classNodes = nodes.filter(n => n.type === 'class');
    expect(classNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'App', type: 'class' }),
      ]),
    );
  });

  it('should extract function nodes', () => {
    const nodes = extractor.extract();
    const funcNodes = nodes.filter(n => n.type === 'function');
    const labels = funcNodes.map(n => n.label);
    expect(labels).toContain('greet');
    expect(labels).toContain('add');
    expect(labels).toContain('run');
  });

  it('should set parent for class methods', () => {
    const nodes = extractor.extract();
    const runNode = nodes.find(n => n.label === 'run');
    const appNode = nodes.find(n => n.label === 'App');
    expect(runNode?.parent).toBe(appNode?.id);
  });

  it('should use relative file paths', () => {
    const nodes = extractor.extract();
    for (const node of nodes) {
      expect(path.isAbsolute(node.filePath)).toBe(false);
    }
  });
});
