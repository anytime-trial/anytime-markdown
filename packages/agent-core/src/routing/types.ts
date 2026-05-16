export type TaskKind = 'chat' | 'embed' | 'extract' | 'review';

export interface TaskRoute {
  readonly providerId: string;
  readonly model: string;
}

export interface ModelRoutingPolicy {
  resolveProviderId(task: TaskKind): string;
  resolveModel(task: TaskKind): string;
  resolve(task: TaskKind): TaskRoute;
}
