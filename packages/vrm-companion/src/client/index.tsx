import type { Context } from '@deepseek-ai/cordis';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  BotPresentation,
  BotPresentationView,
  DockPanelProps,
  PanelServices,
} from '@botharness/ui/panels';
import { mountStage, type Stage, type SceneState, type CameraView } from './stage.js';
import type { Mood } from './room.js';

export const name = 'botharness-vrm-companion-client';
export const inject = ['dockPanels', 'botPresentation'];
const CSS = `
[data-vrm-panel]{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font:inherit}
[data-vrm-panel] > [data-vrm-panel]{flex:1;height:auto}
[data-vrm-stage]{position:absolute;inset:0;overflow:hidden}
[data-vrm-status]{color:var(--dsw-alias-label-secondary)}
[data-vrm-speech]{position:absolute;bottom:12px;right:12px;max-width:55%;max-height:22%;padding:8px 12px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent);backdrop-filter:blur(12px)}
[data-vrm-header]{position:absolute;top:12px;left:12px;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:calc(100% - 24px)}
[data-vrm-header] > [data-vrm-status]{padding:4px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
[data-vrm-instance-actions]{position:absolute;right:12px;top:12px;z-index:2}
[data-vrm-error]{position:absolute;inset:35% 12px auto;z-index:2;background:var(--dsw-alias-bg-base);padding:12px}
[data-vrm-actions]{display:flex;gap:8px;flex-wrap:wrap}
[data-vrm-controls]{position:absolute;bottom:12px;left:12px;max-width:calc(100% - 24px);padding:8px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent);backdrop-filter:blur(12px)}
[data-vrm-controls] summary{cursor:pointer;color:var(--dsw-alias-label-secondary);padding:4px 0}
[data-vrm-controls] [data-vrm-actions]{margin-top:8px}
[data-vrm-dialog]:not([data-expanded]){display:contents}
[data-vrm-dialog][data-expanded]{position:fixed;inset:12px;width:calc(100vw - 24px);height:calc(100vh - 24px);max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:var(--dsw-radius-md);overflow:hidden;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
`;
function Character({ view }: { view: BotPresentationView }) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const cleanup = useRef<(() => void) | undefined>();
  const stageRef = useRef<Stage>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [scene, setScene] = useState<SceneState>({
    phase: 'seated',
    wandering: false,
    ready: false,
  });
  const [camera, setCamera] = useState<CameraView>('desk');
  const [mood, setMood] = useState<Mood>('auto');
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      stageRef.current = undefined;
      if (!node) return;
      try {
        setCamera('desk');
        setMood('auto');
        setScene({ phase: 'seated', wandering: false, ready: false });
        const stage = mountStage(node, __VRM_MODEL__, setError, setScene);
        stageRef.current = stage;
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
    <dialog
      data-vrm-dialog=""
      data-expanded={expanded || undefined}
      open
      ref={dialogRef}
      aria-label={snapshot.name + ' room'}
      onClose={(event) => {
        event.currentTarget.open = true;
        setExpanded(false);
      }}
    >
      <section
        data-vrm-panel=""
        aria-label={snapshot.name + ' character'}
        data-vrm-bot={snapshot.botId}
        data-vrm-activity={snapshot.activity}
        data-vrm-speaking={snapshot.speaking}
      >
        <div data-vrm-stage="" ref={mount} />
        <div data-vrm-header="">
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
          <div data-vrm-actions="">
            <Button
              onClick={() => {
                if (expanded) dialogRef.current?.close();
                else {
                  if (dialogRef.current) dialogRef.current.open = false;
                  dialogRef.current?.showModal();
                  setExpanded(true);
                }
              }}
            >
              {expanded ? 'Return to panel' : 'Expand scene'}
            </Button>
          </div>
        </div>
        {error && (
          <div role="status" data-vrm-error="">
            {error}
            <Button onClick={() => retry((n) => n + 1)}>Retry character</Button>
          </div>
        )}
        <details data-vrm-controls="">
          <summary>Scene controls · {scene.phase}</summary>
          <div data-vrm-actions="" role="group" aria-label="Camera view">
            {(['desk', 'room', 'portrait'] as const).map((value) => (
              <Button
                key={value}
                disabled={!scene.ready}
                aria-pressed={camera === value}
                onClick={() => {
                  stageRef.current?.camera(value);
                  setCamera(value);
                }}
              >
                {value === 'desk' ? 'Desk view' : value === 'room' ? 'Room view' : 'Portrait view'}
              </Button>
            ))}
            <Button disabled={!scene.ready} onClick={() => stageRef.current?.camera(camera)}>
              Reset view
            </Button>
          </div>
          <div data-vrm-actions="" role="group" aria-label="Character movement">
            <Button
              disabled={
                !scene.ready || snapshot.sync !== 'live' || snapshot.paused || !snapshot.available
              }
              onClick={() => stageRef.current?.command('sit')}
            >
              Sit down
            </Button>
            <Button
              disabled={
                !scene.ready || snapshot.sync !== 'live' || snapshot.paused || !snapshot.available
              }
              onClick={() => stageRef.current?.command('stand')}
            >
              Stand up
            </Button>
            <Button
              aria-pressed={scene.wandering}
              disabled={
                !scene.ready || snapshot.sync !== 'live' || snapshot.paused || !snapshot.available
              }
              onClick={() => stageRef.current?.command('wander')}
            >
              {scene.wandering ? 'Stop walking' : 'Walk around'}
            </Button>
          </div>
          <div data-vrm-actions="" role="group" aria-label="Room time">
            {(['auto', 'sunset', 'night'] as const).map((value) => (
              <Button
                key={value}
                disabled={!scene.ready}
                aria-pressed={mood === value}
                onClick={() => {
                  stageRef.current?.mood(value);
                  setMood(value);
                }}
              >
                {value === 'auto' ? 'Local time' : value === 'sunset' ? 'Sunset' : 'Night'}
              </Button>
            ))}
          </div>
          <div data-vrm-status="">
            Drag to orbit · Scroll to zoom. Walking pauses during work and replies.
          </div>
        </details>
        {snapshot.text && (
          <div data-vrm-speech="" aria-label="Bot speech">
            {snapshot.text}
          </div>
        )}
      </section>
    </dialog>
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
        <div data-vrm-actions="" data-vrm-instance-actions="">
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
