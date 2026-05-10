import {
  CREATE_CURRENT_FILE_ANALYSIS,
  CREATE_RELEASE_FILE_ANALYSIS,
} from '../domain/schema';

describe('schema file analysis category column', () => {
  it('CREATE_CURRENT_FILE_ANALYSIS includes category column with CHECK', () => {
    expect(CREATE_CURRENT_FILE_ANALYSIS).toMatch(
      /category\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'logic'\s+CHECK\s*\(\s*category\s+IN\s*\(\s*'ui'\s*,\s*'logic'\s*,\s*'excluded'\s*\)\s*\)/,
    );
  });

  it('CREATE_RELEASE_FILE_ANALYSIS includes category column with CHECK', () => {
    expect(CREATE_RELEASE_FILE_ANALYSIS).toMatch(
      /category\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'logic'\s+CHECK\s*\(\s*category\s+IN\s*\(\s*'ui'\s*,\s*'logic'\s*,\s*'excluded'\s*\)\s*\)/,
    );
  });

  it('CREATE_CURRENT_FILE_ANALYSIS remains STRICT', () => {
    expect(CREATE_CURRENT_FILE_ANALYSIS).toMatch(/\)\s*STRICT\s*$/);
  });

  it('CREATE_RELEASE_FILE_ANALYSIS remains STRICT', () => {
    expect(CREATE_RELEASE_FILE_ANALYSIS).toMatch(/\)\s*STRICT\s*$/);
  });
});
