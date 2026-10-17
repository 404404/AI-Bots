import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HomeDashboard as Dashboard } from '../../../core/src/home/dashboard.js';
import type { RollingUsageRange } from '../../../core/src/usage/usage.js';
import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { openHumanAttentionSource } from './human-attention-source.js';
import { useMountedResource } from './mounted-resource.js';
import { errorMessage } from './bridge.js';
import { Select } from './ds/select.js';
import { color, space, radius, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    padding: space.x4,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    minWidth: 0,
  },
  heading: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
  },
  title: { margin: 0, color: color.fg, fontSize: text.bodySize, fontWeight: text.strong },
  muted: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  value: { margin: 0, color: color.fg, fontSize: text.titleSize, fontWeight: text.strong },
  rows: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x1 },
  row: { minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'start' },
  error: { color: color.danger, margin: 0, overflowWrap: 'anywhere' },
});

const ranges: RollingUsageRange[] = ['24h', '7d', '30d'];
export function HomeDashboard({
  actions,
  registry,
  t,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  const [range, setRange] = useState<RollingUsageRange>('24h');
  const rangeRef = useRef<RollingUsageRange>('24h');
  const [data, setData] = useState<Dashboard>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const load = async (next: RollingUsageRange) => {
    const request = ++generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.homeDashboard(next);
      if (request === generation.current) setData(result);
    } catch (cause) {
      if (request === generation.current) {
        setData(undefined);
        setError(errorMessage(cause));
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load(rangeRef.current);
    return () => {
      generation.current += 1;
    };
  }, [actions]);
  const open = async (navigate: () => Promise<void> | void) => {
    setError(undefined);
    try {
      registry.open(CHANNEL_BODY_PANEL);
      await navigate();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const unavailable = busy && !data ? t('modelPreset.loading') : t('home.unavailable');
  const usage = data?.usage.status === 'ready' ? data.usage.value : undefined;
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { timeZoneName: 'short' });
  return (
    <div
      ref={mount}
      {...stylex.props(styles.root)}
      aria-label={t('home.dashboard')}
      aria-busy={busy}
    >
      <div {...stylex.props(styles.heading)}>
        <p {...stylex.props(styles.muted)}>
          {data ? t('home.asOf', { time: date(data.readAt) }) : unavailable}
        </p>
        <Button variant="ghost" disabled={busy} onClick={() => void load(range)}>
          {t('home.refresh')}
        </Button>
      </div>
      <section {...stylex.props(styles.card)} aria-label={t('home.attentionTitle')}>
        <div {...stylex.props(styles.heading)}>
          <h3 {...stylex.props(styles.title)}>{t('home.attentionTitle')}</h3>
          <Button variant="ghost" onClick={() => registry.open('activity-center')}>
            {t('home.activity')}
          </Button>
        </div>
        {data?.attention.status === 'ready' ? (
          <>
            <p {...stylex.props(styles.muted)}>
              {t('home.attentionSummary', {
                actions: data.attention.value.actionCount,
                unread: data.attention.value.unreadCount,
              })}
            </p>
            <div {...stylex.props(styles.rows)}>
              {data.attention.value.items.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => void open(() => openHumanAttentionSource(actions, item))}
                >
                  <span {...stylex.props(styles.row)}>
                    {item.channelName || item.botSlug} ·{' '}
                    {item.summary || t(`home.attentionKind.${item.kind}`)}
                  </span>
                </Button>
              ))}
            </div>
            {!data.attention.value.actionCount && (
              <p {...stylex.props(styles.muted)}>{t('home.noAttention')}</p>
            )}
          </>
        ) : (
          <p {...stylex.props(styles.muted)}>{unavailable}</p>
        )}
      </section>
      <section {...stylex.props(styles.card)} aria-label={t('home.working')}>
        <h3 {...stylex.props(styles.title)}>{t('home.working')}</h3>
        {data?.working.status === 'ready' ? (
          data.working.value.length ? (
            <div {...stylex.props(styles.rows)}>
              {data.working.value.map((bot) => (
                <Button
                  key={bot.slug}
                  variant="ghost"
                  onClick={() =>
                    void open(async () => {
                      await actions.openBot(bot.slug);
                      actions.openSession(bot.sessions[0]!.sessionId);
                    })
                  }
                >
                  <span {...stylex.props(styles.row)}>
                    {bot.displayName} ·{' '}
                    {bot.sessions
                      .map((session) => session.purpose || t('home.orchestrator'))
                      .join(' · ')}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <p {...stylex.props(styles.muted)}>{t('home.noWorking')}</p>
          )
        ) : (
          <p {...stylex.props(styles.muted)}>{unavailable}</p>
        )}
      </section>
      <section {...stylex.props(styles.card)} aria-label={t('home.usage')}>
        <div {...stylex.props(styles.heading)}>
          <h3 {...stylex.props(styles.title)}>{t('home.usage')}</h3>
          <Select
            label={t('home.usageRange')}
            value={range}
            disabled={busy}
            options={ranges.map((value) => ({ value, label: t(`home.range.${value}`) }))}
            onChange={(next) => {
              rangeRef.current = next;
              setRange(next);
              setData(undefined);
              void load(next);
            }}
          />
        </div>
        <p {...stylex.props(styles.value)}>
          {usage
            ? usage.totalTokens === null
              ? t('home.usageUnknown')
              : `${usage.status === 'partial' ? '≥ ' : ''}${usage.totalTokens.toLocaleString()}`
            : unavailable}
        </p>
        {usage && (
          <>
            <p {...stylex.props(styles.muted)}>
              {date(usage.from)} — {date(usage.to)}
            </p>
            <p {...stylex.props(styles.muted)}>{t(`home.usageStatus.${usage.status}`)}</p>
            {usage.coverageStart && Date.parse(usage.from) < Date.parse(usage.coverageStart) && (
              <p {...stylex.props(styles.muted)}>
                {t('home.usageCoverage', { time: date(usage.coverageStart) })}
              </p>
            )}
            {usage.truncated && <p {...stylex.props(styles.muted)}>{t('home.usageTruncated')}</p>}
            {usage.freshness !== 'ready' && (
              <p role="status" {...stylex.props(styles.muted)}>
                {t(`home.usageFreshness.${usage.freshness}`)}
              </p>
            )}
          </>
        )}
      </section>
      <section {...stylex.props(styles.card)} aria-label={t('home.recent')}>
        <h3 {...stylex.props(styles.title)}>{t('home.recent')}</h3>
        {data?.recent.status === 'ready' ? (
          data.recent.value.length ? (
            <div {...stylex.props(styles.rows)}>
              {data.recent.value.map((item) => (
                <div key={item.kind === 'channel' ? item.channelId : item.sessionId}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void open(async () => {
                        if (item.kind === 'channel')
                          await actions.openChannelAtMessage(item.channelId, item.messageId);
                        else {
                          await actions.openBot(item.botSlug);
                          actions.openSession(item.sessionId);
                        }
                      })
                    }
                  >
                    <span {...stylex.props(styles.row)}>
                      {t(`home.recentKind.${item.kind}`)} · {item.label}
                    </span>
                  </Button>
                  <p {...stylex.props(styles.muted)}>{date(item.at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p {...stylex.props(styles.muted)}>{t('home.noRecent')}</p>
          )
        ) : (
          <p {...stylex.props(styles.muted)}>{unavailable}</p>
        )}
      </section>
      {error && (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
    </div>
  );
}
