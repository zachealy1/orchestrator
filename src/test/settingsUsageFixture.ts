import { vi } from "vitest";
import { EMPTY_USAGE_LIMITS_STATE } from "../features/analytics/usageLimits";
import type {
  SettingsAccountUsageActions,
  SettingsAccountUsageModel,
} from "../features/settings/SettingsAccountUsage";

export const emptySettingsUsage: SettingsAccountUsageModel = {
  accounts: [],
  selectedAccountId: null,
  state: EMPTY_USAGE_LIMITS_STATE,
  reset: {
    canReset: false,
    canConfirm: false,
    retrying: false,
    pending: false,
    confirmation: null,
    message: null,
  },
};
export function settingsUsageActions(): SettingsAccountUsageActions {
  return {
    selectAccount: vi.fn(),
    retry: vi.fn(),
    requestReset: vi.fn(),
    cancelReset: vi.fn(),
    confirmReset: vi.fn().mockResolvedValue(undefined),
  };
}
