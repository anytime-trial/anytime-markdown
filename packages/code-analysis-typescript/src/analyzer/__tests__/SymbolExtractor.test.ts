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

  it('should extract interface nodes', () => {
    const nodes = extractor.extract();
    const interfaceNodes = nodes.filter(n => n.type === 'interface');
    expect(interfaceNodes.map(n => n.label)).toContain('Runnable');
  });

  it('should extract type alias nodes', () => {
    const nodes = extractor.extract();
    const typeNodes = nodes.filter(n => n.type === 'type');
    expect(typeNodes.map(n => n.label)).toContain('AppConfig');
  });

  it('should extract enum nodes', () => {
    const nodes = extractor.extract();
    const enumNodes = nodes.filter(n => n.type === 'enum');
    expect(enumNodes.map(n => n.label)).toContain('LogLevel');
  });

  it('should extract exported variable nodes', () => {
    const nodes = extractor.extract();
    const varNodes = nodes.filter(n => n.type === 'variable');
    expect(varNodes.map(n => n.label)).toContain('DEFAULT_CONFIG');
  });

  it('should use relative file paths', () => {
    const nodes = extractor.extract();
    for (const node of nodes) {
      expect(path.isAbsolute(node.filePath)).toBe(false);
    }
  });

  it('should scope inner methods of non-exported container variables', () => {
    const nodes = extractor.extract();
    const fooExt = nodes.find(n => n.label === 'FooExt');
    const barExt = nodes.find(n => n.label === 'BarExt');
    expect(fooExt).toBeDefined();
    expect(barExt).toBeDefined();
    expect(fooExt?.exported).toBe(false);
    expect(barExt?.exported).toBe(false);

    const addAttrs = nodes.filter(n => n.label === 'addAttributes');
    expect(addAttrs.length).toBe(2);

    const ids = addAttrs.map(n => n.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/::FooExt::addAttributes$/),
        expect.stringMatching(/::BarExt::addAttributes$/),
      ]),
    );

    const fooAttrs = addAttrs.find(n => n.id.includes('::FooExt::'));
    expect(fooAttrs?.parent).toBe(fooExt?.id);
  });

  it('should dedupe TypeScript function overloads to the implementation declaration', () => {
    const nodes = extractor.extract();
    const computeNodes = nodes.filter(n => n.label === 'compute');
    expect(computeNodes.length).toBe(1);
    expect(computeNodes[0].line).toBe(3);
  });
});
