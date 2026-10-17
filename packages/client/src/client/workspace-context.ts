import { createContext, type ReactNode } from 'react';
import type { DockviewApi } from 'dockview-react';

export const WORKSPACE_RAIL = 'bh:workspace-rail';
export const WORKSPACE_CHANNELS = 'bh:channels';
export const WorkspaceContext = createContext<
  | {
      rail(
        api: DockviewApi,
        gap: number,
        setGap: (gap: number) => void,
        reset: () => void,
        order: readonly string[],
        setOrder: (ids: readonly string[]) => void,
        hiddenControls: readonly string[],
        setControlVisible: (id: string, visible: boolean) => void,
      ): ReactNode;
    }
  | undefined
>(undefined);
