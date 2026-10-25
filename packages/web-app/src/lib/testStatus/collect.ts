/**
 * テスト実施状況の収集（`scripts/build-test-status.ts`）が使う純粋関数。
 * ファイル・プロセスへの I/O はスクリプト側に置き、ここは文字列から値を導くだけにする。
 */

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const COVERAGE_NAMED_RE = /(coverage|additional|extra)\d*\.(test|spec)\.[a-z]+$/i;
const WEAK_ASSERTION_RE = /\.(toBeDefined|toBeTruthy)\(\)|\.not\.toThrow\(\)/g;
const EXPECT_RE = /\bexpect\(/g;
const TEST_COMMAND_RE = /\b(npx jest|npm test|npm run test)\b/;
const WORKING_DIRECTORY_RE = /working-directory:\s*packages\/([a-z0-9-]+)/;
const FIX_SUBJECT_RE = /^fix\(([^/)]+)/;
// SEC-01: スナップショットへ環境固有の絶対パスを載せない。検出対象はホーム・一時領域・Windows ドライブ
const ABSOLUTE_PATH_RE = /(?:\/(?:home|Users|tmp|root|var|mnt)\/[^"\s,]*|[A-Za-z]:\\\\[^"\s,]*)/g;

export function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}

/**
 * CI でユニットテストを実行するパッケージを返す。
 * ci.yml はステップ（`- name:`）単位に分け、テストを実行するコマンドを持つステップの
 * working-directory を拾う。working-directory が run より前に書かれたステップもあるため、
 * 行の順序に依存しない。
 */
export function parseCiTestPackages(ciYml: string, coverageActionYml: string): Set<string> {
  const packages = new Set<string>();
  for (const step of ciYml.split(/\n\s*- name:/)) {
    if (!TEST_COMMAND_RE.test(step)) continue;
    const dir = WORKING_DIRECTORY_RE.exec(step);
    if (dir) packages.add(dir[1]);
  }
  const all = /ALL="([^"]+)"/.exec(coverageActionYml);
  if (all) {
    for (const name of all[1].replace(/\\/g, ' ').split(/\s+/)) {
      if (name) packages.add(name);
    }
  }
  return packages;
}

export function countFixesByPackage(logSubjects: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const subject of logSubjects.split('\n')) {
    const match = FIX_SUBJECT_RE.exec(subject);
    if (match) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  }
  return counts;
}

export interface SourceFile {
  readonly name: string;
  readonly source: string;
}

export function countSmells(files: readonly SourceFile[]): {
  coverageNamed: number;
  weak: number;
  expects: number;
} {
  let coverageNamed = 0;
  let weak = 0;
  let expects = 0;
  for (const file of files) {
    if (COVERAGE_NAMED_RE.test(file.name)) coverageNamed++;
    weak += file.source.match(WEAK_ASSERTION_RE)?.length ?? 0;
    expects += file.source.match(EXPECT_RE)?.length ?? 0;
  }
  return { coverageNamed, weak, expects };
}

export function findAbsolutePaths(serialized: string): string[] {
  return serialized.match(ABSOLUTE_PATH_RE) ?? [];
}
