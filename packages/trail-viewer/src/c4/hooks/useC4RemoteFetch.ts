import { useEffect } from 'react';

import type {
  BoundaryInfo,
  C4Model,
  C4ReleaseEntry,
  ComplexityMatrix,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/trail-core/c4';

import {
  isComplexityPayload,
  isDsmMatrixPayload,
  isModelPayload,
  readJson,
} from './c4WsMessages';

/**
 * 起動時に Remote-mode (DB 永続済みモデル) からの初期 fetch を行う hook。
 *
 * - serverUrl === undefined → local mode (fetch しない)
 * - serverUrl === '' → same-origin 相対パス（Next.js 同居モード）
 * - それ以外 → 絶対 URL（拡張機能モード）
 */
export function useRemoteInitialFetch(
  serverUrl: string | undefined,
  selectedRelease: string,
  selectedRepo: string,
  setC4Model: (m: C4Model | null) => void,
  setBoundaries: (b: readonly BoundaryInfo[]) => void,
  setDsmMatrix: (m: DsmMatrix | null) => void,
  setFeatureMatrix: (m: FeatureMatrix | null) => void,
  setCoverageMatrix: (m: CoverageMatrix | null) => void,
  setCoverageDiff: (m: CoverageDiffMatrix | null) => void,
  setComplexityMatrix: (m: ComplexityMatrix | null) => void,
  setReleases: (entries: readonly C4ReleaseEntry[]) => void,
  setDocLinks: (docs: readonly DocLink[]) => void,
  enabled = true,
): void {
  useEffect(() => {
    // C4 タブ未訪問の間は 6 本の初期 fetch を発行しない（起動時過剰取得の回避）。
    if (!enabled) return;
    if (serverUrl === undefined) return;

    let cancelled = false;
    // release/repo 切替やアンマウント時に in-flight な 6 本の fetch を中断する。
    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchInitial(): Promise<void> {
      const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
      const modelUrl = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
      const dsmUrl = `${serverUrl}/api/c4/dsm?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
      // Complexity は累積指標のため release パラメータは送らない
      const complexityUrl = selectedRepo
        ? `${serverUrl}/api/c4/complexity?repo=${encodeURIComponent(selectedRepo)}`
        : `${serverUrl}/api/c4/complexity`;
      const [modelRes, dsmRes, covRes, complexityRes, releasesRes, docsRes] = await Promise.all([
        fetch(modelUrl, { signal }).catch(() => null),
        fetch(dsmUrl, { signal }).catch(() => null),
        fetch(`${serverUrl}/api/c4/coverage?release=${encodeURIComponent(selectedRelease)}${repoQuery}`, { signal }).catch(() => null),
        fetch(complexityUrl, { signal }).catch(() => null),
        fetch(`${serverUrl}/api/c4/releases`, { signal }).catch(() => null),
        fetch(`${serverUrl}/api/docs-index${selectedRepo ? `?repo=${encodeURIComponent(selectedRepo)}` : ''}`, { signal }).catch(() => null),
      ]);

      const [modelJson, dsmJson, covJson, complexityJson, docsJson] = await Promise.all([
        readJson(modelRes),
        readJson(dsmRes),
        readJson(covRes),
        readJson(complexityRes),
        readJson(docsRes),
      ]);
      if (cancelled) return;

      if (isModelPayload(modelJson)) {
        setC4Model(modelJson.model);
        setBoundaries(modelJson.boundaries);
        setFeatureMatrix(modelJson.featureMatrix ?? null);
      } else {
        setC4Model(null);
        setBoundaries([]);
        setFeatureMatrix(null);
      }

      if (isDsmMatrixPayload(dsmJson)) {
        setDsmMatrix(dsmJson.matrix);
      } else {
        setDsmMatrix(null);
      }

      if (covJson && typeof covJson === 'object') {
        const cov = covJson as { coverageMatrix?: CoverageMatrix | null; coverageDiff?: CoverageDiffMatrix | null };
        setCoverageMatrix(cov.coverageMatrix ?? null);
        setCoverageDiff(cov.coverageDiff ?? null);
      } else {
        setCoverageMatrix(null);
        setCoverageDiff(null);
      }

      setComplexityMatrix(isComplexityPayload(complexityJson) ? complexityJson.complexityMatrix : null);

      if (docsJson && typeof docsJson === 'object' && 'docs' in docsJson && Array.isArray((docsJson as { docs: unknown }).docs)) {
        setDocLinks((docsJson as { docs: DocLink[] }).docs);
      }

      if (releasesRes?.status === 200) {
        const json: unknown = await releasesRes.json();
        if (!cancelled && Array.isArray(json)) {
          const normalized: C4ReleaseEntry[] = (json as unknown[]).map((item) => {
            if (typeof item === 'string') {
              return { tag: item, repoName: null };
            }
            if (item && typeof item === 'object' && 'tag' in item) {
              const obj = item as { tag: unknown; repoName?: unknown };
              return {
                tag: String(obj.tag),
                repoName: typeof obj.repoName === 'string' ? obj.repoName : null,
              };
            }
            return null;
          }).filter((e): e is C4ReleaseEntry => e !== null);
          setReleases(normalized);
        }
      }
    }

    void fetchInitial();
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, serverUrl, selectedRelease, selectedRepo, setC4Model, setBoundaries, setDsmMatrix, setFeatureMatrix, setCoverageMatrix, setCoverageDiff, setComplexityMatrix, setReleases, setDocLinks]);
}
