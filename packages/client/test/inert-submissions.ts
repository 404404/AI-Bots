import type { BridgeActions } from '../src/client/actions.js';

export const inertSubmissionActions: Pick<BridgeActions, 'submissions'> = {
  submissions: {
    subscribe: () => () => {},
    snapshot: () => undefined,
    begin: () => undefined,
    cancel: () => {},
    sync: () => {},
    check: async () => 'unknown',
    reconcile: async () => {},
  },
};
