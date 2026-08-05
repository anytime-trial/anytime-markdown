import * as os from 'node:os';

import {
  type ApprovalEvaluation,
  evaluateApprovalPolicy,
  type OddResolution,
  OPERATION_KINDS,
} from '@anytime-markdown/trail-core';
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

export function handleGetOddPolicy(input: GetOddPolicyInput): OddResolution {
  return resolve(input.workspacePath);
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
