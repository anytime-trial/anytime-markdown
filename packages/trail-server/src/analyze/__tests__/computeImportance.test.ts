import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import ts from 'typescript';
import { computeImportance } from '../computeImportance';

function makeProgram(dir: string, files: Record<string, string>): ts.Program {
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  fs.writeFileSync(tsconfigPath, JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] }));
  return ts.createProgram(
    Object.keys(files).map((f) => path.join(dir, f)),
    { strict: true },
  );
}

describe('computeImportance', () => {
  it('対象ファイルの scored と lineCountByFile を返す', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
    const program = makeProgram(dir, {
      'a.ts': 'export function add(x: number, y: number) { return x + y; }\n',
    });
    const result = await computeImportance(path.join(dir, 'tsconfig.json'), undefined, program);
    expect(result).not.toBeNull();
    expect(result!.lineCountByFile.has('a.ts')).toBe(true);
    expect(Array.isArray(result!.scored)).toBe(true);
  });
});
