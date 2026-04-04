import path from 'node:path';
import { ProjectAnalyzer } from '../ProjectAnalyzer';

const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('ProjectAnalyzer', () => {
  it('should create a program from tsconfig.json', () => {
    const analyzer = new ProjectAnalyzer(
      path.join(FIXTURES, 'tsconfig.json'),
    );
    const program = analyzer.getProgram();
    expect(program).toBeDefined();

    const sourceFiles = analyzer.getSourceFiles();
    const names = sourceFiles.map(f =>
      path.relative(FIXTURES, f.fileName),
    );
    expect(names).toContain(path.join('src', 'index.ts'));
    expect(names).toContain(path.join('src', 'utils.ts'));
  });

  it('should exclude node_modules files', () => {
    const analyzer = new ProjectAnalyzer(
      path.join(FIXTURES, 'tsconfig.json'),
    );
    const sourceFiles = analyzer.getSourceFiles();
    for (const f of sourceFiles) {
      expect(f.fileName).not.toContain('node_modules');
    }
  });
});
