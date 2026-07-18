/** ファイル×著者×コミットの生行（commit_files JOIN session_commits 由来） */
export type FileAuthorCommitRow = {
  filePath: string;
  /** git log %an。メールアドレス列が無いため表記ゆれの名寄せは不可 */
  author: string;
  commitHash: string;
};

export type BusFactorEntry = {
  /** 集約単位の ID（ファイルパス、または C4 要素 ID） */
  unitId: string;
  /** 一意化後のコミット数 */
  totalCommits: number;
  authorCount: number;
  topAuthor: string;
  /** 主著者のコミット比率（0-1） */
  topAuthorShare: number;
  /** 実効著者数 exp(シャノンエントロピー)。1 に近いほど属人化 */
  effectiveAuthors: number;
  /**
   * 属人度スコア（0-1・大きいほど属人化 = topAuthorShare）。
   * コミット数が minCommits 未満の単位は判定せず null。
   */
  score: number | null;
};

export type ComputeBusFactorOptions = {
  /** この件数未満のコミットしかない単位は score を出さない（既定 5） */
  minCommits?: number;
  /**
   * ファイルパスを集約単位へ写す（既定はファイルパスそのもの）。
   * C4 要素単位で見るときは、要素へ写してから著者×コミットを合算し score を再計算する
   * （子要素の score を親へ最大値伝播すると属人度の意味が変わるため）。
   */
  unitsOf?: (filePath: string) => readonly string[];
};
