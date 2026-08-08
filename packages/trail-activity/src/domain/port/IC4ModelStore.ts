// domain/port/IC4ModelStore.ts — C4 model storage port
//
// 拡張機能（ローカル sql.js）と web アプリ（Supabase）の両方に対応するための
// C4 モデル読み取り抽象。current（作業中スナップショット）はリポジトリ別に保持する。

import type { C4Model } from '../../c4/types';

export interface C4ModelEntry {
  /** 'current'（ワークスペース current）または release tag */
  readonly tag: string;
  /** 'current' の場合は repo_name、release の場合は紐付くリリースの repo_name（null 可） */
  readonly repoName: string | null;
}

export interface C4ModelResult {
  readonly model: C4Model;
  /** current の場合のみ。release の場合は undefined */
  readonly commitId?: string;
}

export interface IC4ModelStore {
  /**
   * 指定リポジトリの current C4 モデルを取得する。
   * 存在しない場合は null を返す。
   */
  getCurrentC4Model(repoName: string): Promise<C4ModelResult | null> | C4ModelResult | null;

  /**
   * 指定リリースタグの C4 モデルを取得する。
   * 存在しない場合は null を返す。
   */
  getReleaseC4Model(tag: string): Promise<C4ModelResult | null> | C4ModelResult | null;

  /**
   * current_graphs / release_graphs 相当の全エントリを返す。
   * current は先頭（repo_name ごと）、release は released_at 降順。
   */
  getC4ModelEntries(): Promise<readonly C4ModelEntry[]> | readonly C4ModelEntry[];
}
