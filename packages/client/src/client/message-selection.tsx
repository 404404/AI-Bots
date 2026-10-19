import { Menu } from './appearance-primitives.js';
import { createContext, useContext, useRef, useState, type ReactElement } from 'react';
import {
  Button,
  IconCopyOutlineRegular,
  IconDownloadOutlineRegular,
  IconInspectOutlineRegular,
  IconShareOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { MessageSelection } from './message-selection-state.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export const MessageSelectionContext = createContext<MessageSelection | undefined>(undefined);

export function useMessageSelection(): MessageSelection | undefined {
  return useContext(MessageSelectionContext);
}

export type MessageSelectionExport = 'image' | 'diagnostics' | 'conversation';

export function MessageSelectionBar({
  count,
  busy,
  notice,
  onExport,
  onCancel,
  t,
}: {
  count: number;
  busy: boolean;
  notice?: string | undefined;
  onExport(kind: MessageSelectionExport): void;
  onCancel(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  const mount = useMountedResource<HTMLDivElement>(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented && !menuOpenRef.current) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      ref={mount}
      className="bh-selection-bar"
      role="toolbar"
      aria-label={t('selection.toolbar')}
      data-message-selection
    >
      <span className="bh-selection-count" role="status">
        {notice ??
          (count === 0 ? t('selection.hint') : t('selection.count', { count: String(count) }))}
      </span>
      <div className="bh-selection-actions">
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Menu
          open={menuOpen}
          portal
          align="end"
          side="top"
          items={[
            {
              id: 'image',
              label: t('selection.export.image'),
              icon: <IconDownloadOutlineRegular />,
            },
            {
              id: 'conversation',
              label: t('selection.export.conversation'),
              icon: <IconCopyOutlineRegular />,
            },
            {
              id: 'diagnostics',
              label: t('selection.export.diagnostics'),
              icon: <IconInspectOutlineRegular />,
            },
          ]}
          onSelect={(id) => {
            setMenuOpen(false);
            if (id === 'image' || id === 'diagnostics' || id === 'conversation') onExport(id);
          }}
          onClose={() => setMenuOpen(false)}
          anchor={
            <Button
              variant="primary"
              disabled={count === 0 || busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className="bh-selection-export">
                <IconShareOutlineRegular size={16} />
                {t('selection.export')}
              </span>
            </Button>
          }
        />
      </div>
    </div>
  );
}
