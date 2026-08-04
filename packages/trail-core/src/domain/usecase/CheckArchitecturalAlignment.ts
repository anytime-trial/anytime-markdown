import {
  buildC4ElementById,
  mapFileToC4Elements,
  mapFilesToC4Elements,
  type C4Element,
} from '../engine/c4Mapper';
import type {
  AlignmentInput,
  AlignmentScope,
  ChangedFile,
  IFileChangeResolver,
} from '../port/IFileChangeResolver';
import type { ISpecDocIndex, SpecUpdateStatus } from '../port/ISpecDocIndex';

const DEFAULT_MIN_ADDED_LINES = 20;

/**
 * `unknown` は設計書リポジトリのコミットが trail.db へ取り込まれておらず、更新の
 * 有無を判定できない状態。`stale`（更新漏れ）と混同すると、取込が止まっている間
 * 全件が警報になり警報自体が無意味になるため別状態として報告する。
 */
export type AlignmentStatus = 'stale' | 'ok' | 'undocumented' | 'unknown';

export interface AlignmentFinding {
  readonly status: AlignmentStatus;
  readonly elementId: string;
  readonly specPath: string | null;
  readonly changedFiles: readonly string[];
  readonly reason: string;
}

export interface AlignmentReport {
  readonly scope: AlignmentScope;
  readonly checkedFiles: number;
  readonly skippedMinor: number;
  readonly findings: readonly AlignmentFinding[];
}

export interface AlignmentDeps {
  readonly changes: IFileChangeResolver;
  readonly specs: ISpecDocIndex;
  readonly c4Elements: readonly C4Element[];
}

export async function checkArchitecturalAlignment(
  deps: AlignmentDeps,
  input: AlignmentInput,
): Promise<AlignmentReport> {
  const changedFiles = await deps.changes.resolve(input);
  const checkedFiles = changedFiles.length;
  const minAddedLines = input.options?.minAddedLines ?? DEFAULT_MIN_ADDED_LINES;

  const substantialFiles: ChangedFile[] = [];
  let skippedMinor = 0;

  for (const changedFile of changedFiles) {
    if (isExcludedPath(changedFile.filePath)) {
      skippedMinor += 1;
      continue;
    }

    if (!isSubstantialChange(changedFile, minAddedLines)) {
      skippedMinor += 1;
      continue;
    }

    substantialFiles.push(changedFile);
  }

  const substantialPaths = substantialFiles.map((file) => file.filePath);
  const mappedElements = mapFilesToC4Elements(substantialPaths, deps.c4Elements);
  const elementToFiles = mapChangedFilesByElement(substantialPaths, deps.c4Elements);
  const findings: AlignmentFinding[] = [];

  for (const mappedElement of mappedElements) {
    const specs = await deps.specs.findByC4Element(mappedElement.elementId);
    const mappedFiles = elementToFiles.get(mappedElement.elementId) ?? [];

    if (specs.length === 0) {
      findings.push({
        status: 'undocumented',
        elementId: mappedElement.elementId,
        specPath: null,
        changedFiles: mappedFiles,
        reason: `No spec document declares c4Scope for ${mappedElement.elementId}.`,
      });
      continue;
    }

    for (const spec of specs) {
      const updateStatus = await deps.specs.wasUpdatedIn(spec.specPath, input);
      findings.push({
        status: toAlignmentStatus(updateStatus),
        elementId: mappedElement.elementId,
        specPath: spec.specPath,
        changedFiles: mappedFiles,
        reason: describeUpdateStatus(updateStatus, spec.specPath, input.scope),
      });
    }
  }

  return {
    scope: input.scope,
    checkedFiles,
    skippedMinor,
    findings: sortFindings(findings),
  };
}

function toAlignmentStatus(updateStatus: SpecUpdateStatus): AlignmentStatus {
  if (updateStatus === 'updated') return 'ok';
  if (updateStatus === 'unknown') return 'unknown';
  return 'stale';
}

function describeUpdateStatus(
  updateStatus: SpecUpdateStatus,
  specPath: string,
  scope: AlignmentScope,
): string {
  if (updateStatus === 'updated') {
    return `Spec document ${specPath} was updated in this ${scope}.`;
  }
  if (updateStatus === 'unknown') {
    return `Cannot tell whether spec document ${specPath} was updated in this ${scope}: `
      + 'the spec repository commits covering it are missing from trail.db '
      + '(add the spec repository to commit ingestion and re-run the import).';
  }
  // 取込はセッション単位で走るため、どのセッションにも属さない設計書コミットは
  // 取り込まれず、この判定に現れない。not-updated 側にも残る不確実性を隠さない。
  return `Spec document ${specPath} was not updated in this ${scope} `
    + '(spec commits made outside any recorded session are not ingested and cannot be seen here).';
}

function isExcludedPath(filePath: string): boolean {
  const fileName = filePath.split('/').at(-1) ?? filePath;

  return (
    filePath.includes('__tests__/') ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.test.tsx') ||
    filePath.endsWith('.spec.ts') ||
    filePath.endsWith('.spec.tsx') ||
    filePath.endsWith('.d.ts') ||
    fileName === 'package-lock.json' ||
    filePath.endsWith('.snap')
  );
}

function isSubstantialChange(file: ChangedFile, minAddedLines: number): boolean {
  return (
    file.addedExportLines > 0 ||
    file.removedExportLines > 0 ||
    file.linesAdded >= minAddedLines
  );
}

function mapChangedFilesByElement(
  filePaths: readonly string[],
  c4Elements: readonly C4Element[],
): ReadonlyMap<string, readonly string[]> {
  const elementById = buildC4ElementById(c4Elements);
  const elementToFiles = new Map<string, string[]>();

  for (const filePath of filePaths) {
    for (const mapping of mapFileToC4Elements(filePath, elementById)) {
      const filesForElement = elementToFiles.get(mapping.elementId);
      if (filesForElement) {
        filesForElement.push(filePath);
      } else {
        elementToFiles.set(mapping.elementId, [filePath]);
      }
    }
  }

  return elementToFiles;
}

function sortFindings(findings: readonly AlignmentFinding[]): readonly AlignmentFinding[] {
  return [...findings].sort((left, right) => {
    const elementOrder = left.elementId.localeCompare(right.elementId);
    if (elementOrder !== 0) return elementOrder;

    return compareNullableSpecPath(left.specPath, right.specPath);
  });
}

function compareNullableSpecPath(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left.localeCompare(right);
}
