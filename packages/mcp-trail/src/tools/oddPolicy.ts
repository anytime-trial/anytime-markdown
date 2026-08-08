import * as os from 'node:os';

import {
  type ApprovalEvaluation,
  evaluateApprovalPolicy,
  type OddRegistry,
  type OddRegistryFile,
  type OddResolution,
  OPERATION_KINDS,
  serializeOddRegistry,
} from '@anytime-markdown/trail-activity';
import { z } from 'zod';

import { resolveWorkspacePath } from '../dbPath';
import { resolveOddConfig } from '../doctrine/oddRoots';
import { readFileTyped } from '../doctrine/readFile';
import { workspacePathParam } from './workspaceParam';

export const GetOddPolicyInputSchema = z.object({
  workspacePath: workspacePathParam,
});

export const EvaluateApprovalPolicyInputSchema = z.object({
  operation_kind: z
    .enum(OPERATION_KINDS)
    .describe('Operation being evaluated. Everything except code_change is treated as always-human unless the registry says otherwise'),
  target_paths: z
    .array(z.string())
    .describe('Absolute paths the operation affects. Empty = ODD boundary undecidable, which resolves to confirm'),
  language: z
    .string()
    .optional()
    .describe('Language of the target. Omitted = no language check is applied'),
  is_god_node: z
    .boolean()
    .optional()
    .describe('Whether the target is a God Node (high centrality). Omitted = centrality data unavailable, which does NOT suppress allow (reported as impact_unknown)'),
  workspacePath: workspacePathParam,
});

export type GetOddPolicyInput = z.infer<typeof GetOddPolicyInputSchema>;
export type EvaluateApprovalPolicyInput = z.infer<typeof EvaluateApprovalPolicyInputSchema>;

function resolve(workspacePathArg: string | undefined): OddResolution {
  const workspacePath = resolveWorkspacePath(workspacePathArg).path;
  return resolveOddConfig({
    workspacePath: workspacePath ?? process.cwd(),
    homeDir: os.homedir(),
    readFile: readFileTyped,
  });
}

/**
 * `get_odd_policy` の戻り。解決済みの内部形（`registry`）に加えて、そのまま
 * `odd.json` として書ける形（`registrySource`）を返す。
 *
 * 内部形とファイル形式は `narrowing` と `godNodePercentile` の 2 箇所で形が違う。
 * 出力を雛形として使う運用は自然に発生するが、内部形をコピーすると前者は `invalid`
 * になり（既定へ縮退しないので全判断が `escalate` に倒れる）、後者は黙って既定値へ
 * 戻る。往復可能な形を最初から返して、その経路を塞ぐ。
 */
export type GetOddPolicyResult =
  | {
      readonly kind: 'registry' | 'derived';
      readonly registry: OddRegistry;
      readonly registrySource: OddRegistryFile;
    }
  | { readonly kind: 'invalid'; readonly reason: string };

export function handleGetOddPolicy(input: GetOddPolicyInput): GetOddPolicyResult {
  const resolution = resolve(input.workspacePath);
  if (resolution.kind === 'invalid') {
    return resolution;
  }
  return {
    kind: resolution.kind,
    registry: resolution.registry,
    registrySource: serializeOddRegistry(resolution.registry),
  };
}

export function handleEvaluateApprovalPolicy(
  input: EvaluateApprovalPolicyInput,
): ApprovalEvaluation {
  return evaluateApprovalPolicy(resolve(input.workspacePath), {
    operationKind: input.operation_kind,
    targetPaths: input.target_paths,
    language: input.language ?? null,
    isGodNode: input.is_god_node ?? null,
  });
}
