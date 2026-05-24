import path from 'node:path';
import fs from 'node:fs';
import { createPythonParser } from '../PythonParser';
import { PythonSymbolExtractor } from '../PythonSymbolExtractor';

const REL = 'pkg/models.py';
const ABS = path.join(__dirname, 'fixtures', 'pyrepo', REL);

describe('PythonSymbolExtractor', () => {
  it('extracts file, class, function and module-variable nodes with TS-compatible ids', async () => {
    const parser = await createPythonParser();
    const tree = parser.parse(fs.readFileSync(ABS, 'utf8'));
    const nodes = new PythonSymbolExtractor().extract(REL, tree!.rootNode);
    const byType = (t: string) => nodes.filter((n) => n.type === t).map((n) => n.label).sort();

    expect(byType('file')).toEqual(['models.py']);
    expect(byType('class')).toEqual(['Animal', 'Dog']);
    expect(byType('function')).toEqual(['make_dog', 'speak', 'speak']);
    expect(byType('variable')).toEqual(['GREETING']);

    const file = nodes.find((n) => n.type === 'file');
    expect(file?.id).toBe('file::pkg/models.py');
    expect(file?.filePath).toBe('pkg/models.py');

    const speaks = nodes.filter((n) => n.label === 'speak').map((n) => n.id).sort();
    expect(speaks).toEqual(['file::pkg/models.py::Animal::speak', 'file::pkg/models.py::Dog::speak']);

    const greeting = nodes.find((n) => n.label === 'GREETING');
    expect(greeting?.id).toBe('file::pkg/models.py::GREETING');
    expect(greeting?.parent).toBe('file::pkg/models.py');
  });
});
