'use client';

import { extractBoundaries, parseMermaidC4 } from '@anytime-markdown/trail-core/c4';
import type { BoundaryInfo, C4Model, C4ReleaseEntry, CoverageDiffMatrix, CoverageMatrix, DocLink, FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import type { GraphDocument } from '@anytime-markdown/graph-core';
import { layoutWithSubgroups } from '@anytime-markdown/graph-core';
import { c4ToGraphDocument } from '@anytime-markdown/trail-core/c4';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { C4ViewerCore, SupabaseTrailReader } from '@anytime-markdown/trail-viewer';
import type { ElementFormData, RelationshipFormData, SupabaseConfig } from '@anytime-markdown/trail-viewer';
import { useThemeMode } from '../../providers';

const CURRENT_RELEASE_TAG = 'current';

let nextManualId = 1;
function generateManualId(type: string): string {
  return `manual-${type}-${Date.now()}-${nextManualId++}`;
}

export function C4Viewer() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const [c4Model, setC4Model] = useState<C4Model | null>(null);
  const [boundaryInfos, setBoundaryInfos] = useState<readonly BoundaryInfo[]>([]);
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrix | null>(null);
  const [coverageMatrix, setCoverageMatrix] = useState<CoverageMatrix | null>(null);
  const [coverageDiff, setCoverageDiff] = useState<CoverageDiffMatrix | null>(null);
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);
  const [releases, setReleases] = useState<readonly C4ReleaseEntry[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>(CURRENT_RELEASE_TAG);

  const supabaseConfig: SupabaseConfig | undefined = useMemo(() => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!supabaseConfig) {
      setReleases([{ tag: CURRENT_RELEASE_TAG, repoName: null }]);
      return;
    }
    let cancelled = false;
    const reader = new SupabaseTrailReader(supabaseConfig.url, supabaseConfig.anonKey);
    reader.getReleases()
      .then((trailReleases) => {
        if (cancelled) return;
        const entries: C4ReleaseEntry[] = [
          { tag: CURRENT_RELEASE_TAG, repoName: null },
          ...trailReleases.map((r) => ({ tag: r.tag, repoName: r.repoName })),
        ];
        setReleases(entries);
      })
      .catch(() => {
        if (cancelled) return;
        setReleases([{ tag: CURRENT_RELEASE_TAG, repoName: null }]);
      });
    return () => { cancelled = true; };
  }, [supabaseConfig]);

  // --- Data loading ---

  const loadMermaidText = useCallback((text: string) => {
    try {
      const boundaries = extractBoundaries(text);
      const model = parseMermaidC4(text);
      setC4Model(model);
      setBoundaryInfos(boundaries);
    } catch {
      // invalid C4 mermaid
    }
  }, []);

  const loadGraphJson = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      if (data.model && typeof data.model === 'object') {
        const model = data.model as C4Model;
        if (!model.elements || !Array.isArray(model.elements)) return;
        const boundaries = (Array.isArray(data.boundaries) ? data.boundaries : []) as BoundaryInfo[];
        setC4Model(model);
        setBoundaryInfos(boundaries);
        if (data.featureMatrix && typeof data.featureMatrix === 'object') {
          setFeatureMatrix(data.featureMatrix as FeatureMatrix);
        }
        if (data.coverageMatrix && typeof data.coverageMatrix === 'object') {
          setCoverageMatrix(data.coverageMatrix as CoverageMatrix);
        }
        if (data.coverageDiff && typeof data.coverageDiff === 'object') {
          setCoverageDiff(data.coverageDiff as CoverageDiffMatrix);
        }
      }
    } catch {
      // invalid JSON
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/c4model?release=${encodeURIComponent(selectedRelease)}`)
      .then(res => { if (res.ok) return res.json(); })
      .then((data: unknown) => {
        if (cancelled || !data) return;
        loadGraphJson(JSON.stringify(data));
      })
      .catch(() => { /* c4-model.json が取得できない場合は無視 */ });
    return () => { cancelled = true; };
  }, [loadGraphJson, selectedRelease]);

  useEffect(() => {
    fetch('/api/docs-index')
      .then(res => { if (res.ok) return res.json(); })
      .then((data: { docs?: DocLink[] } | undefined) => {
        if (data?.docs) setDocLinks(data.docs);
      })
      .catch(() => { /* docs-index unavailable */ });
  }, []);

  // --- Mutation callbacks ---

  const handleAddElement = useCallback((data: ElementFormData) => {
    if (!c4Model) return;
    const newElement = {
      id: generateManualId(data.type),
      type: data.type as 'person' | 'system',
      name: data.name,
      description: data.description || undefined,
      external: data.external,
      manual: true,
    };
    setC4Model({ ...c4Model, elements: [...c4Model.elements, newElement] });
  }, [c4Model]);

  const handleUpdateElement = useCallback((id: string, data: ElementFormData) => {
    if (!c4Model) return;
    setC4Model({
      ...c4Model,
      elements: c4Model.elements.map(e =>
        e.id === id
          ? { ...e, name: data.name, description: data.description || undefined, external: data.external }
          : e,
      ),
    });
  }, [c4Model]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    if (!c4Model) return;
    setC4Model({
      ...c4Model,
      relationships: [...c4Model.relationships, {
        from: data.from,
        to: data.to,
        label: data.label || undefined,
        technology: data.technology || undefined,
        manual: true,
      }],
    });
  }, [c4Model]);

  const handleRemoveElement = useCallback((id: string) => {
    if (!c4Model) return;
    const elem = c4Model.elements.find(e => e.id === id);
    if (elem?.manual) {
      setC4Model({
        ...c4Model,
        elements: c4Model.elements.filter(e => e.id !== id),
        relationships: c4Model.relationships.filter(r => r.from !== id && r.to !== id),
      });
    } else {
      setC4Model({
        ...c4Model,
        elements: c4Model.elements.map(e => e.id === id ? { ...e, deleted: true } : e),
      });
    }
  }, [c4Model]);

  const handlePurgeDeleted = useCallback(() => {
    if (!c4Model) return;
    const deletedIdSet = new Set(c4Model.elements.filter(e => e.deleted).map(e => e.id));
    setC4Model({
      ...c4Model,
      elements: c4Model.elements.filter(e => !e.deleted),
      relationships: c4Model.relationships.filter(r => !deletedIdSet.has(r.from) && !deletedIdSet.has(r.to)),
    });
  }, [c4Model]);

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    globalThis.open(`/docs/view?ghPath=${encodeURIComponent(doc.path)}`, '_blank');
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd,.mermaid,.txt,.graph,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'graph' || ext === 'json') {
          loadGraphJson(text);
        } else {
          loadMermaidText(text);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadMermaidText, loadGraphJson]);

  return (
    <C4ViewerCore
      isDark={isDark}
      c4Model={c4Model}
      boundaries={boundaryInfos}
      featureMatrix={featureMatrix}
      coverageMatrix={coverageMatrix}
      coverageDiff={coverageDiff}
      docLinks={docLinks}
      onAddElement={handleAddElement}
      onUpdateElement={handleUpdateElement}
      onAddRelationship={handleAddRelationship}
      onRemoveElement={handleRemoveElement}
      onPurgeDeleted={handlePurgeDeleted}
      onDocLinkClick={handleDocLinkClick}
      onImport={handleImport}
      containerHeight="calc(100vh - 64px)"
      releases={releases}
      selectedRelease={selectedRelease}
      onReleaseSelect={setSelectedRelease}
    />
  );
}
