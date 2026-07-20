import type { CooccurrenceFile, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';

export interface FilterModelInput {
  minFrequencyText: string;
  minStrengthText: string;
  topLinkCountText: string;
  selectedClusterIndexes: ReadonlySet<number>;
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMinFrequency(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.max(1, parsed);
}

export function parseMinStrength(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.max(0, parsed);
}

export function parseTopLinkCount(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined || parsed < 1) return undefined;
  return Math.floor(parsed);
}

export function allClusterIndexes(file: CooccurrenceFile): Set<number> {
  return new Set(file.spec.clusters?.map((_, index) => index) ?? []);
}

export function selectedClustersFromOptions(
  file: CooccurrenceFile,
  options: CooccurrenceFilterOptions | undefined,
): Set<number> {
  if (options?.selectedClusterIndexes !== undefined) return new Set(options.selectedClusterIndexes);
  return allClusterIndexes(file);
}

export function createFilterOptions(input: FilterModelInput): CooccurrenceFilterOptions {
  const minFrequency = parseMinFrequency(input.minFrequencyText);
  const minStrength = parseMinStrength(input.minStrengthText);
  const topLinkCount = parseTopLinkCount(input.topLinkCountText);
  return {
    ...(minFrequency === undefined ? {} : { minFrequency }),
    selectedClusterIndexes: [...input.selectedClusterIndexes].sort((a, b) => a - b),
    ...(minStrength === undefined ? {} : { minStrength }),
    ...(topLinkCount === undefined ? {} : { topLinkCount }),
  };
}

export function filterOptionsToInput(
  file: CooccurrenceFile,
  options: CooccurrenceFilterOptions | undefined,
): FilterModelInput {
  return {
    minFrequencyText: options?.minFrequency === undefined ? '' : String(options.minFrequency),
    minStrengthText: options?.minStrength === undefined ? '' : String(options.minStrength),
    topLinkCountText: options?.topLinkCount === undefined ? '' : String(options.topLinkCount),
    selectedClusterIndexes: selectedClustersFromOptions(file, options),
  };
}
