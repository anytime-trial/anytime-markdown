// c4/c4ModelService.ts — C4 model fetch service (pure functions)
//
// HTTP エンドポイント（拡張機能の TrailDataServer / web アプリの Next.js API route）
// から共通で呼び出せる、ストアに依存しない純粋なサービス関数群。

import type { BoundaryInfo, C4Model, FeatureMatrix } from './types';
import type { C4ModelEntry, IC4ModelStore } from '../domain/port';
import type { IManualElementProvider } from './manualTypes';
import { mergeManualIntoC4Model } from './mergeManual';

export interface C4ModelPayload {
  readonly model: C4Model;
  readonly boundaries: readonly BoundaryInfo[];
  readonly featureMatrix?: FeatureMatrix;
  readonly commitId?: string;
}

/**
 * 指定リリース（または 'current'）の C4 モデルをストアから取得する純粋関数。
 * 'current' 時は repoName を使って該当リポジトリの current を取得する。
 * featureMatrix はオプションで、拡張機能の C4Panel が保持している場合のみ添付する。
 * manualProvider が指定された場合、current モデルに手動要素をマージする。
 */
export async function fetchC4Model(
  store: IC4ModelStore,
  releaseId: string,
  repoName: string | undefined,
  featureMatrix?: FeatureMatrix,
  manualProvider?: IManualElementProvider,
): Promise<C4ModelPayload | null> {
  const result =
    releaseId === 'current'
      ? repoName
        ? await Promise.resolve(store.getCurrentC4Model(repoName))
        : null
      : await Promise.resolve(store.getReleaseC4Model(releaseId));

  if (!result) return null;

  let model: C4Model = result.model;
  if (manualProvider && repoName && releaseId === 'current') {
    const [manualElements, manualRelationships] = await Promise.all([
      manualProvider.getElements(repoName),
      manualProvider.getRelationships(repoName),
    ]);
    model = mergeManualIntoC4Model(model, manualElements, manualRelationships);
  }

  const payload: C4ModelPayload = { model, boundaries: [] };
  if (featureMatrix) {
    return { ...payload, featureMatrix, commitId: result.commitId };
  }
  if (result.commitId) {
    return { ...payload, commitId: result.commitId };
  }
  return payload;
}

/**
 * current + release エントリ一覧をストアから取得する純粋関数。
 */
export async function fetchC4ModelEntries(
  store: IC4ModelStore,
): Promise<readonly C4ModelEntry[]> {
  return Promise.resolve(store.getC4ModelEntries());
}
