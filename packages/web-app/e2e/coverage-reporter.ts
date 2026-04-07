import type {
  Reporter,
  FullResult,
} from "@playwright/test/reporter";
import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

// Playwright transforms TS to CJS, so __dirname and require are available
/* eslint-disable @typescript-eslint/no-require-imports */
const v8ToIstanbul: typeof import("v8-to-istanbul").default =
  require("v8-to-istanbul");
const {
  AnyMap,
  encodedMappings,
}: typeof import("@jridgewell/trace-mapping") =
  require("@jridgewell/trace-mapping");

const V8_COV_DIR = join(__dirname, "..", ".v8-coverage");
const OUT_DIR = join(__dirname, "..", "coverage");
const PROJECT_ROOT = join(__dirname, "..");

interface V8Entry {
  url: string;
  source?: string;
  sourceMapJson?: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{
      startOffset: number;
      endOffset: number;
      count: number;
    }>;
    isBlockCoverage: boolean;
  }>;
}

/** Include only project source chunks from Turbopack */
function shouldInclude(entry: V8Entry): boolean {
  if (!entry.url.includes("_next/static/chunks/packages_")) return false;
  if (entry.url.includes("node_modules")) return false;
  if (!entry.source || entry.source.length < 500) return false;
  if (!entry.sourceMapJson) return false;
  return true;
}

class CoverageReporter implements Reporter {
  async onEnd(_result: FullResult): Promise<void> {
    let covFiles: string[];
    try {
      covFiles = await readdir(V8_COV_DIR);
    } catch {
      return;
    }

    const istanbulMap: Record<string, unknown> = {};

    for (const covFile of covFiles) {
      if (!covFile.endsWith(".json")) continue;
      const raw = await readFile(join(V8_COV_DIR, covFile), "utf-8");
      const entries: V8Entry[] = JSON.parse(raw);

      for (const entry of entries) {
        if (!shouldInclude(entry)) continue;

        try {
          // Turbopack emits sectioned source maps; flatten them for v8-to-istanbul
          const rawMap = JSON.parse(entry.sourceMapJson!);
          const flatMap = flattenSourceMap(rawMap);

          // Strip sourceMappingURL to prevent v8-to-istanbul from trying to read .map files
          const cleanSource = entry.source!.replace(
            /\/\/[#@]\s*sourceMappingURL=\S+/g,
            "",
          );
          // Use a local dummy path so v8-to-istanbul doesn't try to resolve HTTP URLs
          const dummyPath = join(PROJECT_ROOT, "e2e-coverage-temp.js");
          const converter = v8ToIstanbul(dummyPath, 0, {
            source: cleanSource,
            sourceMap: { sourcemap: flatMap },
          });
          await converter.load();
          converter.applyCoverage(entry.functions);
          const istanbul = converter.toIstanbul();

          for (const [filePath, data] of Object.entries(istanbul)) {
            const normalizedPath = normalizePath(filePath);
            if (!normalizedPath) continue;

            if (istanbulMap[normalizedPath]) {
              mergeFileCoverage(
                istanbulMap[normalizedPath] as Record<string, unknown>,
                data as Record<string, unknown>,
              );
            } else {
              istanbulMap[normalizedPath] = data;
            }
          }
        } catch {
          // Skip entries that fail to convert (e.g. chunk loaders without source)
        }
      }
    }

    if (Object.keys(istanbulMap).length > 0) {
      await mkdir(OUT_DIR, { recursive: true });
      await writeFile(
        join(OUT_DIR, "coverage-final.json"),
        JSON.stringify(istanbulMap, null, 2),
      );
      console.log(
        `\nE2E coverage: ${Object.keys(istanbulMap).length} files → coverage/coverage-final.json`,
      );
    }

    await rm(V8_COV_DIR, { recursive: true, force: true });
  }
}

/**
 * Flatten a potentially sectioned source map into a standard source map.
 * Turbopack emits sectioned (index) source maps that v8-to-istanbul cannot handle directly.
 */
function flattenSourceMap(
  rawMap: Record<string, unknown>,
): Record<string, unknown> {
  if (!rawMap.sections) return rawMap;
  const traced = new AnyMap(rawMap as Parameters<typeof AnyMap>[0]);
  return {
    version: 3,
    sources: traced.sources,
    sourcesContent: traced.sourcesContent,
    mappings: encodedMappings(traced),
    names: traced.names,
  };
}

/**
 * Normalize source map paths to relative paths from project root.
 * Turbopack source maps use [project]/ prefix for project files.
 */
function normalizePath(filePath: string): string | undefined {
  if (filePath.includes("node_modules")) return undefined;
  if (filePath.includes("[turbopack]")) return undefined;
  if (filePath.endsWith(".json")) return undefined;

  // Handle [project]/ prefix from Turbopack source maps
  const projectPrefix = "[project]/";
  const idx = filePath.indexOf(projectPrefix);
  if (idx >= 0) {
    let rel = filePath.substring(idx + projectPrefix.length);
    // Paths like src/app/... are relative to web-app, normalize to monorepo root
    if (rel.startsWith("src/")) {
      rel = `packages/web-app/${rel}`;
    }
    if (rel.includes("/src/")) return rel;
    return undefined;
  }

  // Handle file:// URLs from source maps
  if (filePath.startsWith("file://")) {
    filePath = filePath.replace("file://", "");
  }

  // Handle absolute paths — normalize to monorepo-relative
  if (filePath.startsWith(PROJECT_ROOT)) {
    const rel = relative(PROJECT_ROOT, filePath);
    if (rel.startsWith("src/")) return `packages/web-app/${rel}`;
    if (rel.includes("/src/")) return rel;
    return undefined;
  }

  return undefined;
}

function mergeFileCoverage(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  const targetS = target.s as Record<string, number>;
  const sourceS = source.s as Record<string, number>;
  for (const key of Object.keys(sourceS)) {
    targetS[key] = (targetS[key] ?? 0) + sourceS[key];
  }
  const targetF = target.f as Record<string, number>;
  const sourceF = source.f as Record<string, number>;
  for (const key of Object.keys(sourceF)) {
    targetF[key] = (targetF[key] ?? 0) + sourceF[key];
  }
  const targetB = target.b as Record<string, number[]>;
  const sourceB = source.b as Record<string, number[]>;
  for (const key of Object.keys(sourceB)) {
    if (targetB[key]) {
      for (let i = 0; i < sourceB[key].length; i++) {
        targetB[key][i] = (targetB[key][i] ?? 0) + sourceB[key][i];
      }
    } else {
      targetB[key] = sourceB[key];
    }
  }
}

export default CoverageReporter;
