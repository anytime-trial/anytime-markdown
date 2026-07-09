import { useEffect, useRef, useState } from 'react';

import type { TrailTreeNode } from '../../../domain/parser/types';

// IntersectionObserver hook for scroll sync (TraceTree → Timeline)
export function useTimelineScrollSync(
  nodes: readonly TrailTreeNode[],
): { visibleUuid: string | null } {
  const [visibleUuid, setVisibleUuid] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current?.disconnect();

    // flatMap は (value, index, array) を渡すため、単項の collect は明示的にラップする
    const collect = (n: TrailTreeNode): string[] => [
      n.message.uuid,
      ...n.children.flatMap((child) => collect(child)),
    ];
    const uuids = new Set(nodes.flatMap((n) => collect(n)));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const uuid = (entry.target as HTMLElement).dataset['messageUuid'];
            if (uuid && uuids.has(uuid)) {
              setVisibleUuid(uuid);
              break;
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const uuid of uuids) {
      const el = document.querySelector(`[data-message-uuid="${uuid}"]`);
      if (el) observer.observe(el);
    }

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [nodes]);

  return { visibleUuid };
}
