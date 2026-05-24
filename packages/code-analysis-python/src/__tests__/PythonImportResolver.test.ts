import { PythonImportResolver } from '../PythonImportResolver';

describe('PythonImportResolver', () => {
  const files = new Set(['pkg/__init__.py', 'pkg/models.py', 'pkg/sub/__init__.py', 'pkg/sub/mod.py', 'app.py', 'util.py']);
  const r = new PythonImportResolver(files);

  it('resolves absolute dotted module to file', () => {
    expect(r.resolve('pkg.models', 'app.py')).toBe('pkg/models.py');
  });

  it('resolves a package name to its __init__.py', () => {
    expect(r.resolve('pkg', 'app.py')).toBe('pkg/__init__.py');
  });

  it('resolves a single-dot relative import within a package', () => {
    expect(r.resolve('.models', 'pkg/__init__.py')).toBe('pkg/models.py');
    expect(r.resolve('.sub.mod', 'pkg/__init__.py')).toBe('pkg/sub/mod.py');
  });

  it('resolves a double-dot relative import to the parent package', () => {
    expect(r.resolve('..models', 'pkg/sub/mod.py')).toBe('pkg/models.py');
  });

  it('returns undefined for external / stdlib / unresolvable modules', () => {
    expect(r.resolve('os.path', 'app.py')).toBeUndefined();
    expect(r.resolve('numpy', 'app.py')).toBeUndefined();
  });
});
