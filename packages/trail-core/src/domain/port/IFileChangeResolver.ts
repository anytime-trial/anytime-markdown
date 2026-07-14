export type AlignmentScope = 'session' | 'range';

export interface AlignmentOptions {
  /** 実質的変更とみなす追加行数の下限。既定 20 */
  readonly minAddedLines?: number;
}

export type AlignmentInput =
  | { readonly scope: 'session'; readonly sessionId: string; readonly options?: AlignmentOptions }
  | { readonly scope: 'range'; readonly fromRef: string; readonly toRef: string; readonly options?: AlignmentOptions };

export interface ChangedFile {
  /** リポジトリ相対パス。例: packages/trail-core/src/foo.ts */
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  /** diff の追加行のうち export を含む行数 */
  readonly addedExportLines: number;
  /** diff の削除行のうち export を含む行数 */
  readonly removedExportLines: number;
}

export interface IFileChangeResolver {
  resolve(input: AlignmentInput): Promise<readonly ChangedFile[]>;
}
