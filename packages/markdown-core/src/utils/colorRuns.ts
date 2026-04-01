export interface ColorRun {
  color: string;
  count: number;
}

/** 連続する同色をランとして集約する */
export function buildColorRuns(colors: (string | null)[]): ColorRun[] {
  const runs: ColorRun[] = [];
  for (const c of colors) {
    const color = c ?? "transparent";
    const last = runs.at(-1);
    if (last && last.color === color) {
      last.count++;
    } else {
      runs.push({ color, count: 1 });
    }
  }
  return runs;
}
