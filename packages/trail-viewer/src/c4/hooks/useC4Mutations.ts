import { useCallback, useEffect, useState } from 'react';

import type {
  BoundaryInfo,
  C4Model,
  FeatureMatrix,
  ManualGroup,
} from '@anytime-markdown/trail-activity/c4';

import { isModelPayload, readJson } from './c4WsMessages';

export interface AddElementRequest {
  type: string;
  name: string;
  description?: string;
  external?: boolean;
  parentId?: string | null;
  serviceType?: string;
}

export interface AddRelationshipRequest {
  fromId: string;
  toId: string;
  label?: string;
  technology?: string;
}

export interface UseC4MutationsOptions {
  serverUrl: string;
  selectedRelease: string;
  selectedRepo: string;
  setC4Model: (m: C4Model | null) => void;
  setBoundaries: (b: readonly BoundaryInfo[]) => void;
  setFeatureMatrix: (m: FeatureMatrix | null) => void;
}

export interface UseC4MutationsResult {
  manualGroups: readonly ManualGroup[];
  refetchModel: () => Promise<void>;
  refetchManualGroups: () => Promise<void>;
  addElement: (data: AddElementRequest) => Promise<void>;
  updateElement: (id: string, changes: { name?: string; description?: string; external?: boolean }) => Promise<void>;
  removeElement: (id: string) => Promise<void>;
  addRelationship: (data: AddRelationshipRequest) => Promise<void>;
  removeRelationship: (id: string) => Promise<void>;
  addGroup: (memberIds: readonly string[], label?: string) => Promise<void>;
  updateGroup: (id: string, changes: { memberIds?: readonly string[]; label?: string | null }) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
}

/**
 * C4 model の手動 CRUD と manual groups の取得・更新を管理する hook。
 * refetchModel は WS の model-updated 通知側からも参照されるため、戻り値で公開する。
 */
export function useC4Mutations({
  serverUrl,
  selectedRelease,
  selectedRepo,
  setC4Model,
  setBoundaries,
  setFeatureMatrix,
}: UseC4MutationsOptions): UseC4MutationsResult {
  const [manualGroups, setManualGroups] = useState<readonly ManualGroup[]>([]);

  // Refetch just the C4 model (used after manual element edits, and from the WS notification).
  const refetchModel = useCallback(async (): Promise<void> => {
    if (serverUrl === undefined) return;
    const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
    const url = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
    try {
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (isModelPayload(json)) {
        setC4Model(json.model);
        setBoundaries(json.boundaries);
        setFeatureMatrix(json.featureMatrix ?? null);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, [serverUrl, selectedRelease, selectedRepo, setC4Model, setBoundaries, setFeatureMatrix]);

  const refetchManualGroups = useCallback(async (): Promise<void> => {
    if (serverUrl === undefined || !selectedRepo) {
      setManualGroups([]);
      return;
    }
    try {
      const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (Array.isArray(json)) {
        setManualGroups(json as ManualGroup[]);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, [serverUrl, selectedRepo]);

  useEffect(() => {
    void refetchManualGroups();
  }, [refetchManualGroups]);

  const addElement = useCallback(async (data: AddElementRequest): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const updateElement = useCallback(async (id: string, changes: { name?: string; description?: string; external?: boolean }): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const removeElement = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const addRelationship = useCallback(async (data: AddRelationshipRequest): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-relationships?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const removeRelationship = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-relationships/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const addGroup = useCallback(async (memberIds: readonly string[], label?: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: [...memberIds], label }) });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  const updateGroup = useCallback(async (id: string, changes: { memberIds?: readonly string[]; label?: string | null }): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    const body: Record<string, unknown> = {};
    if (changes.memberIds !== undefined) body.memberIds = [...changes.memberIds];
    if (changes.label !== undefined) body.label = changes.label;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  const removeGroup = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  return {
    manualGroups,
    refetchModel,
    refetchManualGroups,
    addElement,
    updateElement,
    removeElement,
    addRelationship,
    removeRelationship,
    addGroup,
    updateGroup,
    removeGroup,
  };
}
