import type { Context } from '@deepseek-ai/cordis';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  BotPresentation,
  BotPresentationView,
  DockPanelProps,
  PanelServices,
} from '@botharness/ui/panels';
import {
  mountStage,
  type Stage,
  type SceneState,
  type CameraView,
  type SceneChoices,
} from './stage.js';
import type { Mood, Weather } from './room.js';
import type { CharacterShading } from './shading.js';
import { forgetModel, loadModel, saveModel } from './library.js';

export const name = 'botharness-vrm-companion-client';
export const inject = ['dockPanels', 'botPresentation'];
const CSS = `
[data-vrm-panel]{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font:inherit}
[data-vrm-panel] > [data-vrm-panel]{flex:1;height:auto}
[data-vrm-stage]{position:absolute;inset:0;overflow:hidden}
[data-vrm-status]{color:var(--dsw-alias-label-secondary)}
[data-vrm-speech]{--vrm-bubble-width:min(300px,calc(var(--vrm-panel-width,100vw) - 24px));--vrm-bubble-left:clamp(12px,calc(var(--vrm-head-x,70vw) - 150px),calc(var(--vrm-panel-width,100vw) - var(--vrm-bubble-width) - 12px));position:absolute;z-index:1;left:var(--vrm-bubble-left);bottom:clamp(12px,calc(100% - var(--vrm-head-y,35%) + 22px),calc(100% - 72px));width:var(--vrm-bubble-width);display:flex;flex-direction:column;gap:4px;padding:10px 14px;border:1px solid var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 22px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);transform-origin:calc(var(--vrm-head-x,70vw) - var(--vrm-bubble-left)) calc(100% + 10px);animation:vrm-speech-in .22s cubic-bezier(.2,.9,.3,1.2)}
[data-vrm-speech]::before,[data-vrm-speech]::after{content:'';position:absolute;left:clamp(14px,calc(var(--vrm-head-x,70vw) - var(--vrm-bubble-left) - 11px),calc(var(--vrm-bubble-width) - 36px));bottom:-11px;width:22px;height:11.5px;pointer-events:none}
[data-vrm-speech]::before{background:var(--dsw-alias-label-primary);clip-path:path('M0 0.5 L8.9 9.4 Q11 11.5 13.1 9.4 L22 0.5 Z')}
[data-vrm-speech]::after{background:var(--dsw-alias-bg-base);clip-path:path('M2.6 0 L10.5 7.9 Q11 8.4 11.5 7.9 L19.4 0 Z')}
[data-vrm-speech] > small{font-family:var(--dsw-font-markdown-code-block-font-family);color:var(--dsw-alias-label-secondary)}
[data-vrm-speech] > p{margin:0;max-height:7.5em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
@keyframes vrm-speech-in{from{opacity:0;transform:scale(.92) translateY(6px)}}
@media (prefers-reduced-motion:reduce){[data-vrm-speech]{animation:none}}
[data-vrm-header]{position:absolute;top:12px;left:12px;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:calc(100% - 24px)}
[data-vrm-header] > [data-vrm-status]{padding:4px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
[data-vrm-instance-actions]{position:absolute;right:12px;top:12px;z-index:2}
[data-vrm-panel]:has(> [data-vrm-instance-actions]) [data-vrm-header]{top:56px}
[data-vrm-error]{position:absolute;inset:35% 12px auto;z-index:2;background:var(--dsw-alias-bg-base);padding:12px}
[data-vrm-loading]{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1;padding:4px 8px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
[data-vrm-actions]{display:flex;gap:8px;flex-wrap:wrap}
[data-vrm-model-actions]{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%;padding:4px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
[data-vrm-model-name]{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
[data-vrm-controls]{position:absolute;bottom:12px;left:12px;max-width:calc(100% - 24px);padding:8px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent);backdrop-filter:blur(12px)}
[data-vrm-controls] summary{cursor:pointer;color:var(--dsw-alias-label-secondary);padding:4px 0}
[data-vrm-controls] [data-vrm-actions]{margin-top:8px}
[data-vrm-instance-actions]{padding:4px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent)}
`;
const remembered = new Map<string, SceneChoices>();
const models = new Map<string, { name: string; url: string }>();
const looked = new Set<string>();
function Character({ view }: { view: BotPresentationView }) {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const cleanup = useRef<(() => void) | undefined>();
  const stageRef = useRef<Stage>();
  const key = snapshot.botId;
  const initial = remembered.get(key) ?? {
    camera: 'desk',
    mood: 'auto',
    weather: 'clear',
    shading: 'mtoon',
    effects: true,
  };
  const [shading, setShading] = useState<CharacterShading>(initial.shading);
  const [scene, setScene] = useState<SceneState>({
    phase: 'seated',
    wandering: false,
    ready: false,
  });
  const [camera, setCamera] = useState<CameraView>(initial.camera);
  const [mood, setMood] = useState<Mood>(initial.mood);
  const [weather, setWeather] = useState<Weather>(initial.weather);
  const [effects, setEffects] = useState(initial.effects);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  const [model, setModel] = useState(models.get(key));
  const [kept, setKept] = useState(true);
  const picker = useRef<HTMLInputElement>(null);
  const use = (next: { name: string; url: string } | undefined) => {
    const previous = models.get(key);
    if (previous) URL.revokeObjectURL(previous.url);
    if (next) models.set(key, next);
    else models.delete(key);
    setModel(next);
    retry((n) => n + 1);
  };
  const choose = (file: File | undefined) => {
    if (!file) {
      use(undefined);
      setKept(true);
      void forgetModel(key);
      return;
    }
    use({ name: file.name, url: URL.createObjectURL(file) });
    void saveModel(key, { name: file.name, file }).then(setKept);
  };
  const remember = (change: Partial<SceneChoices>) =>
    remembered.set(key, { ...(remembered.get(key) ?? initial), ...change });
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      stageRef.current = undefined;
      if (!node) return;
      if (!looked.has(key)) {
        let current = true;
        cleanup.current = () => {
          current = false;
        };
        setLoading('Loading character…');
        void loadModel(key).then((stored) => {
          looked.add(key);
          if (stored && !models.has(key))
            models.set(key, { name: stored.name, url: URL.createObjectURL(stored.file) });
          if (current) retry((n) => n + 1);
        });
        return;
      }
      setModel(models.get(key));
      try {
        const choices = remembered.get(key) ?? initial;
        setCamera(choices.camera);
        setShading(choices.shading);
        setMood(choices.mood);
        setWeather(choices.weather);
        setEffects(choices.effects);
        setError('');
        setScene({ phase: 'seated', wandering: false, ready: false });
        const stage = mountStage(
          node,
          models.get(key)?.url ?? __VRM_MODEL__,
          { loading: setLoading, error: setError, changed: setScene },
          choices,
          { headphones: !models.has(key) },
        );
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
    [view, revision, key],
  );
  return (
    <section
      data-vrm-panel=""
      aria-label={snapshot.name + ' character'}
      data-vrm-bot={snapshot.botId}
      data-vrm-activity={snapshot.activity}
      data-vrm-speaking={snapshot.speaking}
      data-vrm-model={model ? 'file' : 'sample'}
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
        <div data-vrm-model-actions="" role="group" aria-label="Character model">
          <Button onClick={() => picker.current?.click()}>Change character…</Button>
          {model && (
            <>
              <span data-vrm-model-name="" title={model.name}>
                {model.name}
                {kept ? '' : ' · this session only'}
              </span>
              <Button onClick={() => choose(undefined)}>Use default</Button>
            </>
          )}
          <input
            ref={picker}
            type="file"
            accept=".vrm,model/gltf-binary"
            hidden
            aria-label="VRM file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) choose(file);
            }}
          />
        </div>
      </div>
      {loading && !error && (
        <div role="status" data-vrm-loading="">
          {loading}
        </div>
      )}
      {error && (
        <div role="status" data-vrm-error="">
          {error}
          <Button onClick={() => retry((n) => n + 1)}>Retry character</Button>
        </div>
      )}
      <details data-vrm-controls="">
        <summary>Scene controls · {scene.phase}</summary>
        <div data-vrm-actions="" role="group" aria-label="Character shading">
          {(['mtoon', 'liltoon'] as const).map((value) => (
            <Button
              key={value}
              disabled={!scene.ready}
              aria-pressed={shading === value}
              onClick={() => {
                stageRef.current?.shading(value);
                setShading(value);
                remember({ shading: value });
              }}
            >
              {value === 'mtoon' ? 'MToon' : 'lilToon'}
            </Button>
          ))}
        </div>
        <div data-vrm-actions="" role="group" aria-label="Camera view">
          {(['desk', 'room', 'portrait'] as const).map((value) => (
            <Button
              key={value}
              disabled={!scene.ready}
              aria-pressed={camera === value}
              onClick={() => {
                stageRef.current?.camera(value);
                setCamera(value);
                remember({ camera: value });
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
                remember({ mood: value });
              }}
            >
              {value === 'auto' ? 'Local time' : value === 'sunset' ? 'Sunset' : 'Night'}
            </Button>
          ))}
        </div>
        <div data-vrm-actions="" role="group" aria-label="Weather">
          {(['clear', 'rain'] as const).map((value) => (
            <Button
              key={value}
              disabled={!scene.ready}
              aria-pressed={weather === value}
              onClick={() => {
                stageRef.current?.weather(value);
                setWeather(value);
                remember({ weather: value });
              }}
            >
              {value === 'clear' ? 'Clear' : 'Rain'}
            </Button>
          ))}
        </div>
        <div data-vrm-actions="" role="group" aria-label="Look">
          {([true, false] as const).map((value) => (
            <Button
              key={String(value)}
              disabled={!scene.ready}
              aria-pressed={effects === value}
              onClick={() => {
                stageRef.current?.effects(value);
                setEffects(value);
                remember({ effects: value });
              }}
            >
              {value ? 'Lo-fi look' : 'Plain'}
            </Button>
          ))}
        </div>
        <div data-vrm-status="">
          Drag to orbit · Scroll to zoom. Walking pauses during work and replies.
        </div>
      </details>
      {snapshot.text && (
        <div data-vrm-speech="" aria-label="Bot speech">
          <small>{snapshot.name}</small>
          <p>{snapshot.text}</p>
        </div>
      )}
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
