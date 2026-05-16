import type { ModelRoutingPolicy, TaskKind, TaskRoute } from './types';

export interface DefaultModelRoutingPolicyOptions {
  readonly defaultProviderId: string;
  readonly defaultModel: string;
  readonly overrides?: Partial<Record<TaskKind, TaskRoute>>;
}

export class DefaultModelRoutingPolicy implements ModelRoutingPolicy {
  private readonly defaultRoute: TaskRoute;
  private readonly overrides = new Map<TaskKind, TaskRoute>();

  constructor(opts: DefaultModelRoutingPolicyOptions) {
    this.defaultRoute = {
      providerId: opts.defaultProviderId,
      model: opts.defaultModel,
    };
    if (opts.overrides) {
      for (const [task, route] of Object.entries(opts.overrides)) {
        if (route) this.overrides.set(task as TaskKind, route);
      }
    }
  }

  resolve(task: TaskKind): TaskRoute {
    return this.overrides.get(task) ?? this.defaultRoute;
  }

  resolveProviderId(task: TaskKind): string {
    return this.resolve(task).providerId;
  }

  resolveModel(task: TaskKind): string {
    return this.resolve(task).model;
  }

  setOverride(task: TaskKind, route: TaskRoute): void {
    this.overrides.set(task, route);
  }

  clearOverride(task: TaskKind): void {
    this.overrides.delete(task);
  }
}
