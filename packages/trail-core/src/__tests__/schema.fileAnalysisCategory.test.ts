import { CREATE_CURRENT_FILE_ANALYSIS } from '../domain/schema';

// release_file_analysis / release_function_analysis の DDL は 2026-08-08 に機能ごと廃止した。
describe('schema file analysis category column', () => {
  it('CREATE_CURRENT_FILE_ANALYSIS includes category column with CHECK', () => {
    expect(CREATE_CURRENT_FILE_ANALYSIS).toMatch(
      /category\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'logic'\s+CHECK\s*\(\s*category\s+IN\s*\(\s*'ui'\s*,\s*'logic'\s*,\s*'excluded'\s*\)\s*\)/,
    );
  });

  it('CREATE_CURRENT_FILE_ANALYSIS remains STRICT', () => {
    expect(CREATE_CURRENT_FILE_ANALYSIS).toMatch(/\)\s*STRICT\s*$/);
  });
});
