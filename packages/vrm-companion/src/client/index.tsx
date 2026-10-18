import type { Context } from '@deepseek-ai/cordis';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  BotPresentation,
  BotPresentationView,
  DockPanelProps,
  PanelServices,
} from '@botharness/ui/panels';
import { mountStage } from './stage.js';

export const name = 'botharness-vrm-companion-client';
export const inject = ['dockPanels', 'botPresentation'];
const CSS = `
[data-vrm-panel]{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-primary);font:inherit}
[data-vrm-panel] > [data-vrm-panel]{flex:1;height:auto}
[data-vrm-stage]{flex:1;min-height:0;overflow:hidden}
[data-vrm-status]{color:var(--dsw-alias-label-secondary)}
[data-vrm-speech]{max-height:30%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
[data-vrm-actions]{display:flex;gap:8px;flex-wrap:wrap}
`;
function Character({ view }: { view: BotPresentationView }) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const cleanup = useRef<(() => void) | undefined>();
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!node) return;
      try {
        const stage = mountStage(node, __VRM_MODEL__, setError);
        const update = () => stage.update(view.getSnapshot());
        update();
        const unsubscribe = view.subscribe(update);
        cleanup.current = () => {
          unsubscribe();
          stage.dispose();
        };
      } catch {
        setError('3D is unavailable. Bot activity and messages remain available.');
      }
    },
    [view, revision],
  );
  return (
    <section
      data-vrm-panel=""
      aria-label={snapshot.name + ' character'}
      data-vrm-bot={snapshot.botId}
      data-vrm-activity={snapshot.activity}
      data-vrm-speaking={snapshot.speaking}
    >
      <div data-vrm-status="" role="status">
        {snapshot.available
          ? snapshot.name +
            ' · ' +
            (snapshot.paused
              ? 'Paused'
              : snapshot.sync === 'live'
                ? snapshot.activity
                : snapshot.sync)
          : 'Bot unavailable'}
      </div>
      {snapshot.attention && <div role="status">{snapshot.attention}</div>}
      {error && (
        <div role="status">
          {error}
          <Button onClick={() => retry((n) => n + 1)}>Retry character</Button>
        </div>
      )}
      <div data-vrm-stage="" ref={mount} />
      <div data-vrm-speech="" aria-label="Bot speech">
        {snapshot.text || 'New replies appear here.'}
      </div>
    </section>
  );
}
function BoundCharacter({ botId, presentation }: { botId: string; presentation: BotPresentation }) {
  const [view, setView] = useState<BotPresentationView>();
  const cleanup = useRef<(() => void) | undefined>();
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!node) return;
      const current = presentation.acquire(botId);
      cleanup.current = current.dispose;
      setView(current);
    },
    [botId, presentation],
  );
  return (
    <div data-vrm-panel="" ref={mount}>
      {view ? <Character key={botId} view={view} /> : <div role="status">Connecting…</div>}
    </div>
  );
}
export function apply(ctx: Context & PanelServices): void {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = '@botharness/vrm-companion';
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  });
  const Panel = ({ channel, botId, instanceId }: DockPanelProps) => {
    const [failure, setFailure] = useState('');
    const binding = botId ?? (channel?.type === 'dm' ? channel.botSlug : undefined);
    return binding ? (
      <div data-vrm-panel="">
        <div data-vrm-actions="">
          {instanceId ? (
            <Button
              onClick={() => {
                try {
                  ctx.dockPanels.removeInstance(instanceId);
                } catch {
                  setFailure('Could not delete the saved character panel.');
                }
              }}
            >
              Delete instance
            </Button>
          ) : (
            <Button
              onClick={() => {
                try {
                  ctx.dockPanels.createInstance(
                    'botharness-vrm',
                    binding,
                    ctx.botPresentation.bots().find((b) => b.id === binding)?.name ?? binding,
                  );
                  setFailure('');
                } catch {
                  setFailure('Could not save the fixed character panel.');
                }
              }}
            >
              Pin character globally
            </Button>
          )}
        </div>
        {failure && <div role="alert">{failure}</div>}
        <BoundCharacter key={binding} botId={binding} presentation={ctx.botPresentation} />
      </div>
    ) : null;
  };
  ctx.effect(() =>
    ctx.dockPanels.register({
      id: 'botharness-vrm',
      title: 'VRM Companion',
      icon: 'bot',
      scope: 'channel',
      binding: 'current-bot',
      defaultPosition: { zone: 'right' },
      component: Panel,
    }),
  );
}
