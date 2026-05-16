import type { ProviderKind } from '../registry/types';

export interface HealthSnapshot {
  readonly providerId: string;
  readonly kind: ProviderKind;
  readonly ok: boolean;
  readonly detail?: string;
  readonly checkedAt: string;
}
