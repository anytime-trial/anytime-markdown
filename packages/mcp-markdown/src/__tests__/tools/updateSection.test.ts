import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { updateSectionInText, updateSection } from '../../tools/updateSection';

describe('updateSectionInText', () => {
  const doc = '# Title\n\nIntro.\n\n## Section A\n\nOld content.\n\n## Section B\n\nKeep this.\n';

  it('should replace section content', () => {
    const result = updateSectionInText(doc, '## Section A', '## Section A\n\nNew content.\n\n');
    expect(result).toContain('New content.');
    expect(result).not.toContain('Old content.');
    expect(result).toContain('Keep this.');
  });

  it('should replace last section', () => {
    const result = updateSectionInText(doc, '## Section B', '## Section B\n\nUpdated.\n');
    expect(result).toContain('Updated.');
    expect(result).not.toContain('Keep this.');
    expect(result).toContain('Old content.');
  });

  it('should throw for non-existent heading', () => {
    expect(() => updateSectionInText(doc, '## Not Exist', 'new')).toThrow('not found');
  });

  it('should preserve content before and after', () => {
    const result = updateSectionInText(doc, '## Section A', '## Section A\n\nReplaced.\n\n');
    expect(result).toBe('# Title\n\nIntro.\n\n## Section A\n\nReplaced.\n\n## Section B\n\nKeep this.\n');
  });

  it('should throw for invalid heading format (no # prefix)', () => {
    expect(() => updateSectionInText(doc, 'Not a heading', 'new')).toThrow('Invalid heading format');
  });

  it('should throw for invalid heading format (too many # marks)', () => {
    expect(() => updateSectionInText(doc, '####### Heading', 'new')).toThrow('Invalid heading format');
  });

  it('should replace from-start section (no before, with after)', () => {
    // ## A は同レベル `## B` の前まで、その時 before は空文字 (target が先頭)
    const fromStart = '## A\n\nOld.\n\n## B\n\nKept.\n';
    const result = updateSectionInText(fromStart, '## A', '## A\n\nReplaced.\n');
    expect(result).toBe('## A\n\nReplaced.\n## B\n\nKept.\n');
  });

  it('should handle single section doc (no before, no after)', () => {
    const single = '# Only\n';
    const result = updateSectionInText(single, '# Only', '# Only\n\nNew.');
    expect(result).toBe('# Only\n\nNew.');
  });
});

describe('updateSectionInText duplicate headings', () => {
  const dup = '## 例\n\nFirst.\n\n## Other\n\nO.\n\n## 例\n\nSecond.\n';

  it('should throw for ambiguous duplicate headings without occurrence', () => {
    expect(() => updateSectionInText(dup, '## 例', '## 例\n\nX.\n')).toThrow(/Ambiguous heading/);
  });

  it('should replace the nth occurrence (1-based)', () => {
    const result = updateSectionInText(dup, '## 例', '## 例\n\nReplaced.\n', 2);
    expect(result).toContain('First.');
    expect(result).toContain('Replaced.');
    expect(result).not.toContain('Second.');
  });

  it('should throw when occurrence is out of range', () => {
    expect(() => updateSectionInText(dup, '## 例', 'x', 3)).toThrow(/out of range/);
  });
});

describe('updateSection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should update section in file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# T\n\n## A\n\nOld\n\n## B\n\nKeep\n');
    await updateSection({ path: 'test.md', heading: '## A', content: '## A\n\nNew\n\n' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'test.md'), 'utf-8');
    expect(content).toContain('New');
    expect(content).not.toContain('Old');
    expect(content).toContain('Keep');
  });

  it('should return a diff summary (oldLines/newLines/bytesDelta/warnings)', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '# T\n\n## A\n\nOld\n\n## B\n\nKeep\n');
    const bytesBefore = Buffer.byteLength(await fs.readFile(filePath, 'utf-8'));
    const summary = await updateSection(
      { path: 'test.md', heading: '## A', content: '## A\n\nNew longer body\n\n' },
      tmpDir,
    );
    const bytesAfter = Buffer.byteLength(await fs.readFile(filePath, 'utf-8'));
    // 旧セクション '## A\n\nOld\n' = 4 行 / 新 content = 5 行
    expect(summary.oldLines).toBe(4);
    expect(summary.newLines).toBe(5);
    // bytesDelta はファイル全体の実バイト増減（セクション差とは区切り改行分ずれ得る）
    expect(summary.bytesDelta).toBe(bytesAfter - bytesBefore);
    expect(summary.warnings).toEqual([]);
  });

  it('should warn when content does not start with a heading line', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# T\n\n## A\n\nOld\n');
    const summary = await updateSection({ path: 'test.md', heading: '## A', content: 'Body only.\n' }, tmpDir);
    expect(summary.warnings.some((w) => w.includes('heading'))).toBe(true);
  });

  it('should warn when content starts with a different heading (rename)', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# T\n\n## A\n\nOld\n');
    const summary = await updateSection({ path: 'test.md', heading: '## A', content: '## Renamed\n\nOld\n' }, tmpDir);
    expect(summary.warnings.some((w) => w.includes('Renamed'))).toBe(true);
  });

  it('should update the nth occurrence in file and echo occurrence in summary', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '## A\n\nFirst\n\n## A\n\nSecond\n');
    const summary = await updateSection(
      { path: 'test.md', heading: '## A', content: '## A\n\nReplaced\n', occurrence: 2 },
      tmpDir,
    );
    expect(summary.occurrence).toBe(2);
    const content = await fs.readFile(path.join(tmpDir, 'test.md'), 'utf-8');
    expect(content).toContain('First');
    expect(content).toContain('Replaced');
    expect(content).not.toContain('Second');
  });
});
