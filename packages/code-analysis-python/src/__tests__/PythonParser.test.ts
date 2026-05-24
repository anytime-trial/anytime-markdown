import { createPythonParser } from '../PythonParser';

describe('PythonParser', () => {
  it('parses Python source to a module tree', async () => {
    const parser = await createPythonParser();
    const tree = parser.parse('def foo():\n    return 1\n');
    expect(tree?.rootNode.type).toBe('module');
    expect(tree?.rootNode.namedChildren[0]?.type).toBe('function_definition');
  });
});
