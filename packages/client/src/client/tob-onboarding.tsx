import { useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { onboardingFor } from './onboarding.js';
import { store } from './store.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.panel,
    padding: space.x4,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
  },
  copy: { margin: 0, color: color.muted, fontSize: text.bodySize },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x2 },
});
export function TobOnboarding({
  actions,
  t,
  ready,
  hasDraft,
  suggest,
  openChannel,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  ready: boolean;
  hasDraft: boolean;
  suggest(body: string): void;
  openChannel(id: string): void;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const journey = state.receipt?.journey;
  if (!journey || journey.done || state.receipt?.tutorial !== 'active' || state.guideOpen)
    return null;
  const step = !ready
    ? 'model'
    : !journey.botSlug
      ? 'bot'
      : !journey.groupChannelId
        ? 'group'
        : state.layoutComplete
          ? 'chat'
          : 'layout';
  const number = ['model', 'bot', 'group', 'layout', 'chat'].indexOf(step) + 1;
  const created = client.bots.find((bot) => bot.slug === journey.botSlug);
  return (
    <section
      {...stylex.props(styles.card)}
      aria-label={t('onboarding.short.title')}
      data-tob-onboarding
    >
      <div {...stylex.props(styles.heading)}>
        <strong>{t(`onboarding.short.${step}`)}</strong>
        <span {...stylex.props(styles.copy)}>
          {t('onboarding.short.progress', { step: String(number) })}
        </span>
      </div>
      <p {...stylex.props(styles.copy)}>{t(`onboarding.short.${step}Hint`)}</p>
      {hasDraft && (step === 'bot' || step === 'group') ? (
        <p {...stylex.props(styles.copy)}>{t('onboarding.short.draft')}</p>
      ) : null}
      <div {...stylex.props(styles.actions)}>
        {step === 'model' || step === 'chat' ? null : step === 'layout' ? (
          <Button variant="ghost" onClick={() => void controller.startTour()}>
            {t(state.layoutComplete ? 'onboarding.restart' : 'onboarding.short.tour')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={hasDraft || state.busy}
            onClick={() =>
              suggest(
                step === 'bot'
                  ? t('onboarding.short.botPrompt')
                  : t('onboarding.short.groupPrompt', {
                      name: created?.displayName ?? journey.botSlug!,
                    }),
              )
            }
          >
            {t('onboarding.short.suggest')}
          </Button>
        )}
        {journey.botSlug ? (
          <Button variant="ghost" onClick={() => openChannel('dm-' + journey.botSlug)}>
            {t('onboarding.short.openBot')}
          </Button>
        ) : null}
        {journey.groupChannelId ? (
          <Button variant="ghost" onClick={() => openChannel(journey.groupChannelId!)}>
            {t('onboarding.short.openGroup')}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void controller.refresh(undefined, 'pause')}>
          {t('onboarding.short.pause')}
        </Button>
        <Button variant="ghost" onClick={() => controller.skipTutorial()}>
          {t('onboarding.short.skip')}
        </Button>
      </div>
    </section>
  );
}
