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
});
