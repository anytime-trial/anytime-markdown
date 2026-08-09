import type { GraphNode } from '@anytime-markdown/graph-core';
import { engine } from '@anytime-markdown/graph-core';
import type { C4Model } from '@anytime-markdown/trail-activity/c4';

import {
  SELECTED_ELEMENT_DETAILS_RIGHT_OFFSET,
  SELECTED_ELEMENT_DETAILS_WIDTH,
  TREND_CHART_POPUP_GAP,
  TREND_CHART_POPUP_MAX_WIDTH,
} from '../constants';

const TREND_CHART_RESERVED_RIGHT_WIDTH =
  SELECTED_ELEMENT_DETAILS_WIDTH + SELECTED_ELEMENT_DETAILS_RIGHT_OFFSET + TREND_CHART_POPUP_GAP;

export const { fitToContent } = engine;

export function getActivityTrendChartWidth(hasSelectedElementDetails: boolean): string {
  return hasSelectedElementDetails
    ? `min(${TREND_CHART_POPUP_MAX_WIDTH}px, calc(100% - ${TREND_CHART_RESERVED_RIGHT_WIDTH}px))`
    : `min(${TREND_CHART_POPUP_MAX_WIDTH}px, calc(100% - 16px))`;
}

export function getActivityTrendChartPlacement() {
  return {
    position: 'absolute' as const,
    left: 8,
    bottom: 8,
    zIndex: 9,
  };
}

export function canShowManualContextActions(
  c4Model: C4Model | null,
  c4Id: string | null,
): boolean {
  if (!c4Model || !c4Id) return false;
  return c4Model.elements.some((element) => element.id === c4Id && element.manual === true);
}

export function matchesDocScope(docScope: readonly string[], elementId: string): boolean {
  return docScope.some(scope => scope === elementId || scope.startsWith(`${elementId}/`));
}

export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

/** Bounding box of a set of graph nodes */
export function computeBounds(nodes: readonly GraphNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  return { minX, minY, maxX, maxY };
}
