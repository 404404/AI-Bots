import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelCatalogEntryView, type ModelRouteView } from './bridge.js';
import { BotIcon } from './bot-icon.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import { Modal } from './modal.js';
import { ModelPicker } from './model-picker.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { openModelsSettingsAndReturn } from './bot-settings-open.js';
import {
  APPEARANCE_PRIMARY,
  type Appearance,
  type AppearanceMode,
  type AppearancePatch,
  type AppearancePreference,
  type AppearancePreset,
  type AppearanceSnapshot,
} from './appearance.js';
import { appearanceMaterials } from './appearance-materials.js';
import { AppearanceMaterialSettings } from './appearance-material-settings.js';
import { WallpaperSettings } from './wallpaper-settings.js';
import type { Wallpaper } from './wallpaper.js';
import { CommunityIcon } from './community-icons.js';
import { COMMUNITY, cachedGithubStars, fetchGithubStars, formatStars } from './community-links.js';
import { requestHomeMessage } from './home-requests.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { onboardingFor } from './onboarding.js';
import { invalidateInheritedModelPlans } from './model-plan-store.js';

export const INTRO_STEPS = ['welcome', 'theme', 'model', 'community', 'start'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];

const PRESETS: readonly { id: AppearancePreset; label: BotHarnessKey }[] = [
  { id: 'classic-blue', label: 'appearance.classicBlue' },
  { id: 'mist-purple', label: 'appearance.mistPurple' },
  { id: 'forest-green', label: 'appearance.forestGreen' },
  { id: 'warm-amber', label: 'appearance.warmAmber' },
];
const REVIEWS: readonly BotHarnessKey[] = [
  'intro.reviews.clean',
  'intro.reviews.era',
  'intro.reviews.details',
];

const SCHEMES: readonly { id: AppearancePreference; label: BotHarnessKey }[] = [
  { id: 'system', label: 'settings.theme.system' },
  { id: 'light', label: 'settings.theme.light' },
  { id: 'dark', label: 'settings.theme.dark' },
];
const STARTERS: readonly BotHarnessKey[] = [
  'onboarding.short.botPrompt',
  'onboarding.firstRequest',
  'onboarding.exampleRequest',
];

const styles = stylex.create({
  dialog: {
    width: dialog.medium,
    maxWidth: '100%',
    height: '600px',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    paddingBottom: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    paddingBlock: space.x5,
    paddingInline: space.x6,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
  },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
    flexGrow: { default: 1, ':last-child': 0 },
  },
  stepButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
    borderRadius: radius.sm,
  },
  stepCurrent: { color: color.fg, fontWeight: text.strong },
  stepDot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.inlineIcon,
    height: size.inlineIcon,
    borderRadius: radius.round,
    cornerShape: 'round',
    backgroundColor: color.surface,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  stepDotActive: { backgroundColor: color.accent, color: color.onAccent },
  stepLabel: { '@media (max-width: 760px)': { display: 'none' } },
  stepLine: {
    flexGrow: 1,
    minWidth: space.x4,
    height: border.hairline,
    backgroundColor: color.border,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x6,
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: space.x6,
  },
  bodyCentered: { justifyContent: 'safe center' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    paddingBlock: space.x5,
    paddingInline: space.x6,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  progress: {
    flexGrow: 1,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x4,
    textAlign: 'center',
  },
  heroCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    maxWidth: '560px',
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  copy: {
    margin: 0,
    color: color.muted,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  letter: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x5,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  reviews: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: space.x3,
  },
  review: {
    margin: 0,
    padding: space.x4,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  advanced: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
  },
  advancedSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    cursor: 'pointer',
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  note: { display: 'flex', flexDirection: 'column', gap: space.x2 },
  signature: { margin: 0, alignSelf: 'flex-end', color: color.muted, fontSize: text.bodySize },
  section: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  sectionTitle: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(3, minmax(0, 1fr))',
      '@media (max-width: 640px)': '1fr',
    },
    gap: space.x4,
  },
  grid4: {
    gridTemplateColumns: {
      default: 'repeat(4, minmax(0, 1fr))',
      '@media (max-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.x3,
    minWidth: 0,
    padding: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: { default: color.border, ':hover': color.borderStrong },
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
  },
  cardSelected: {
    borderColor: { default: color.accent, ':hover': color.accent },
    backgroundColor: color.accentTint,
  },
  cardLabel: { textAlign: 'center', fontWeight: text.strong },
  preview: {
    position: 'relative',
    overflow: 'hidden',
    aspectRatio: '5 / 2',
    borderRadius: radius.md,
  },
  previewLayer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    gap: space.x3,
    padding: space.x3,
  },
  previewSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    width: '24%',
    padding: space.x2,
    borderRadius: radius.sm,
  },
  previewMain: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    flexGrow: 1,
    padding: space.x3,
    borderRadius: radius.sm,
  },
  previewLine: { height: space.x3, borderRadius: radius.xs },
  previewComposer: {
    position: 'absolute',
    insetInline: space.x3,
    bottom: space.x3,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: space.x5,
    paddingInline: space.x2,
    borderRadius: radius.sm,
  },
  previewDot: { width: space.x4, height: space.x4, borderRadius: radius.round },
  orbs: { display: 'flex', justifyContent: 'center', gap: space.x5, paddingBlock: space.x3 },
  orb: {
    width: '52px',
    height: '52px',
    borderRadius: radius.round,
    cornerShape: 'round',
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x4,
    padding: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: { default: color.border, ':hover': color.borderStrong },
    borderRadius: radius.lg,
    color: color.fg,
    textDecoration: 'none',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
  linkIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size.nav,
    height: size.nav,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.fg,
  },
  linkText: { display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 },
  linkTitle: { fontWeight: text.strong, fontSize: text.titleSize, lineHeight: text.titleLine },
  stars: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    paddingInline: space.x4,
    height: size.icon,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    color: color.fg,
    fontWeight: text.strong,
    whiteSpace: 'nowrap',
  },
  starters: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    width: '100%',
    maxWidth: '560px',
  },
  starter: {
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: 'pointer',
  },
});

export function BotIntro({
  actions,
  appearance,
  wallpaper,
  t,
}: {
  actions: BridgeActions;
  appearance?: Appearance | undefined;
  wallpaper?: Wallpaper | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const media = useSyncExternalStore(wallpaper?.subscribe ?? noSubscribe, () =>
    wallpaper?.getSnapshot(),
  );
  const intro = state.intro;
  const [model, setModel] = useState<{ save(): Promise<boolean> }>();
  const [busy, setBusy] = useState(false);
  if (!intro) return null;
  const step = INTRO_STEPS[intro.step] ?? 'welcome';
  const last = intro.step === INTRO_STEPS.length - 1;
  const clear = step === 'theme' && media?.current !== undefined;
  const go = async (next: number) => {
    if (next > intro.step && step === 'model' && model) {
      setBusy(true);
      const saved = await model.save().finally(() => setBusy(false));
      if (!saved) return;
    }
    controller.setIntroStep(next);
  };
  return (
    <Modal
      open={!intro.hidden}
      headless
      title={t('intro.title')}
      onClose={() => void controller.closeIntro()}
      backdropBlur={!clear}
      className={
        (stylex.props(styles.dialog).className ?? '') + (clear ? ' bh-intro-see-through' : '')
      }
    >
      <div {...stylex.props(styles.header)}>
        <ol {...stylex.props(styles.stepper)} aria-label={t('intro.title')}>
          {INTRO_STEPS.map((id, index) => (
            <li key={id} {...stylex.props(styles.stepItem)}>
              <button
                type="button"
                aria-current={index === intro.step ? 'step' : undefined}
                disabled={busy}
                onClick={() => void go(index)}
                {...stylex.props(styles.stepButton, index === intro.step && styles.stepCurrent)}
              >
                <span
                  {...stylex.props(styles.stepDot, index <= intro.step && styles.stepDotActive)}
                >
                  {index < intro.step ? <ChannelSidebarIcon name="check" size={14} /> : index + 1}
                </span>
                <span {...stylex.props(styles.stepLabel)}>{t(`intro.step.${id}`)}</span>
              </button>
              {index < INTRO_STEPS.length - 1 ? (
                <span aria-hidden="true" {...stylex.props(styles.stepLine)} />
              ) : null}
            </li>
          ))}
        </ol>
        <IconButton
          aria-label={t('common.close')}
          size="icon"
          onClick={() => void controller.closeIntro()}
        >
          <ChannelSidebarIcon name="x" size={16} />
        </IconButton>
      </div>
      <div
        {...stylex.props(
          styles.body,
          (step === 'welcome' || step === 'start') && styles.bodyCentered,
        )}
        data-intro-step={step}
      >
        {step === 'welcome' ? <WelcomeStep t={t} /> : null}
        {step === 'theme' && appearance ? (
          <ThemeStep appearance={appearance} wallpaper={wallpaper} t={t} />
        ) : null}
        {step === 'model' ? (
          <ModelStep
            actions={actions}
            t={t}
            bind={setModel}
            hide={(hidden) => controller.hideIntro(hidden)}
          />
        ) : null}
        {step === 'community' ? <CommunityStep t={t} /> : null}
        {step === 'start' ? (
          <StartStep
            t={t}
            pick={(body) =>
              void controller.closeIntro().then(() => {
                if (body !== undefined) requestHomeMessage(body);
              })
            }
          />
        ) : null}
      </div>
      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.progress)}>
          {t('intro.progress', {
            current: String(intro.step + 1),
            total: String(INTRO_STEPS.length),
          })}
        </span>
        {last ? null : (
          <Button variant="ghost" disabled={busy} onClick={() => void controller.closeIntro()}>
            {t('intro.skip')}
          </Button>
        )}
        {intro.step > 0 ? (
          <Button variant="outline" disabled={busy} onClick={() => void go(intro.step - 1)}>
            {t('intro.back')}
          </Button>
        ) : null}
        {last ? null : (
          <Button
            variant="primary"
            data-modal-autofocus
            disabled={busy}
            onClick={() => void go(intro.step + 1)}
          >
            {t('intro.next')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

const noSubscribe = () => () => {};

function WelcomeStep({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <>
      <div {...stylex.props(styles.hero)}>
        <BotIcon icon="mascot" size={96} />
        <div {...stylex.props(styles.heroCopy)}>
          <h2 {...stylex.props(styles.title)}>{t('intro.welcome.greeting')}</h2>
          <p {...stylex.props(styles.copy)}>{t('intro.welcome.body')}</p>
          <p {...stylex.props(styles.copy)}>{t('intro.welcome.next')}</p>
        </div>
      </div>
      <section {...stylex.props(styles.letter)} aria-label={t('intro.founder.title')}>
        <h3 {...stylex.props(styles.sectionTitle)}>{t('intro.founder.title')}</h3>
        <div {...stylex.props(styles.note)} data-founder-note>
          {t('intro.founder.body')
            .split('\n')
            .map((line) => (
              <p key={line} {...stylex.props(styles.copy)}>
                {line}
              </p>
            ))}
        </div>
        <p {...stylex.props(styles.signature)}>{t('intro.founder.signature')}</p>
      </section>
      <section {...stylex.props(styles.section)} aria-label={t('intro.reviews.title')}>
        <h3 {...stylex.props(styles.sectionTitle)}>{t('intro.reviews.title')}</h3>
        <div {...stylex.props(styles.reviews)} data-user-reviews>
          {REVIEWS.map((key) => (
            <blockquote key={key} {...stylex.props(styles.review)}>
              {t(key)}
            </blockquote>
          ))}
        </div>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section {...stylex.props(styles.section)} aria-label={title}>
      <h3 {...stylex.props(styles.sectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

function ThemeStep({
  appearance,
  wallpaper,
  t,
}: {
  appearance: Appearance;
  wallpaper?: Wallpaper | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const theme = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const media = useSyncExternalStore(wallpaper?.subscribe ?? noSubscribe, () =>
    wallpaper?.getSnapshot(),
  );
  const change = (patch: AppearancePatch) => {
    try {
      appearance.update(patch);
    } catch {}
  };
  const preset = theme.config.modes[theme.mode].preset;
  return (
    <>
      <h2 {...stylex.props(styles.title)}>{t('intro.theme.title')}</h2>
      {theme.error ? <Note tone="danger">{t('appearance.saveFailed')}</Note> : null}
      <Section title={t('intro.theme.scheme')}>
        <div {...stylex.props(styles.grid)} role="radiogroup" aria-label={t('intro.theme.scheme')}>
          {SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              role="radio"
              aria-checked={theme.config.preference === scheme.id}
              onClick={() => change({ preference: scheme.id })}
              {...stylex.props(
                styles.card,
                theme.config.preference === scheme.id && styles.cardSelected,
              )}
            >
              <SchemePreview theme={theme} scheme={scheme.id} />
              <span {...stylex.props(styles.cardLabel)}>{t(scheme.label)}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('intro.theme.color')}>
        <div
          {...stylex.props(styles.grid, styles.grid4)}
          role="radiogroup"
          aria-label={t('intro.theme.color')}
        >
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={preset === entry.id}
              onClick={() => {
                change({ mode: 'light', preset: entry.id });
                change({ mode: 'dark', preset: entry.id });
              }}
              {...stylex.props(styles.card, preset === entry.id && styles.cardSelected)}
            >
              <span {...stylex.props(styles.orbs)} aria-hidden="true">
                {(['light', 'dark'] as const).map((mode) => (
                  <span
                    key={mode}
                    {...stylex.props(styles.orb)}
                    style={{ background: orb(APPEARANCE_PRIMARY[entry.id][mode], mode) }}
                  />
                ))}
              </span>
              <span {...stylex.props(styles.cardLabel)}>{t(entry.label)}</span>
            </button>
          ))}
        </div>
      </Section>
      {wallpaper ? (
        <WallpaperSettings key={media?.resourceVersion} owner={wallpaper} t={t} />
      ) : null}
      {media?.current ? (
        <Section title={t('intro.theme.panels')}>
          <Note>{t('intro.theme.panelsHint')}</Note>
          <AppearanceMaterialSettings appearance={appearance} snapshot={theme} t={t} />
        </Section>
      ) : null}
    </>
  );
}

function orb(primary: string, mode: AppearanceMode): string {
  const shade = mode === 'light' ? 'white' : 'black';
  return `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${primary} 30%, white) 0%, ${primary} 55%, color-mix(in srgb, ${primary} 55%, ${shade}) 100%)`;
}

function SchemePreview({
  theme,
  scheme,
}: {
  theme: AppearanceSnapshot;
  scheme: AppearancePreference;
}): ReactElement {
  const layer = (mode: AppearanceMode, clip?: string) => {
    const config = theme.config.modes[mode];
    const materials = appearanceMaterials(config, mode);
    const primary = config.primary ?? APPEARANCE_PRIMARY[config.preset][mode];
    const base = materials.body.color;
    const ink = `color-mix(in srgb, ${base} 82%, ${mode === 'light' ? 'black' : 'white'})`;
    const panel = `color-mix(in srgb, ${base} 92%, ${mode === 'light' ? 'black' : 'white'})`;
    return (
      <span
        {...stylex.props(styles.previewLayer)}
        style={{ backgroundColor: panel, ...(clip ? { clipPath: clip } : {}) }}
      >
        <span
          {...stylex.props(styles.previewSide)}
          style={{ backgroundColor: materials.header.color }}
        >
          {[60, 80, 70].map((width) => (
            <span
              key={width}
              {...stylex.props(styles.previewLine)}
              style={{ width: `${width}%`, backgroundColor: ink }}
            />
          ))}
        </span>
        <span {...stylex.props(styles.previewMain)} style={{ backgroundColor: base }}>
          <span
            {...stylex.props(styles.previewLine)}
            style={{ width: '30%', alignSelf: 'flex-end', backgroundColor: primary, opacity: 0.6 }}
          />
          <span
            {...stylex.props(styles.previewLine)}
            style={{ width: '62%', backgroundColor: ink }}
          />
          <span
            {...stylex.props(styles.previewLine)}
            style={{ width: '44%', backgroundColor: ink }}
          />
          <span {...stylex.props(styles.previewComposer)} style={{ backgroundColor: panel }}>
            <span {...stylex.props(styles.previewDot)} style={{ backgroundColor: primary }} />
          </span>
        </span>
      </span>
    );
  };
  return (
    <span {...stylex.props(styles.preview)} aria-hidden="true">
      {scheme === 'dark' ? layer('dark') : layer('light')}
      {scheme === 'system' ? layer('dark', 'inset(0 0 0 50%)') : null}
    </span>
  );
}

function ModelStep({
  actions,
  t,
  bind,
  hide,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  bind(model: { save(): Promise<boolean> } | undefined): void;
  hide(hidden: boolean): void;
}): ReactElement {
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
  const [route, setRoute] = useState<ModelRouteView>();
  const [assignment, setAssignment] = useState<ModelRouteView>();
  const [advanced, setAdvanced] = useState(false);
  const [planned, setPlanned] = useState<string>();
  const [initial, setInitial] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const load = async (): Promise<void> => {
    setError(undefined);
    try {
      const catalog = await actions.modelCatalog();
      setModels(catalog.models);
      const usable = catalog.models.find((model) => model.credential === undefined);
      const selected =
        catalog.default ??
        (usable ? { provider: usable.provider, model: usable.model } : undefined);
      setRoute((previous) => previous ?? selected);
      setInitial(catalog.default ? routeKey(catalog.default) : undefined);
      setLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions]);
  const selected = models.find(
    (model) => model.provider === route?.provider && model.model === route.model,
  );
  const tob = onboardingFor(actions).getSnapshot().receipt?.defaultBotSlug;
  const split =
    advanced && assignment !== undefined && route !== undefined
      ? routeKey(assignment) !== routeKey(route) ||
        (assignment.reasoningEffort ?? '') !== (route.reasoningEffort ?? '')
      : false;
  const save = async (): Promise<boolean> => {
    if (!route || !selected || selected.credential !== undefined) return true;
    const plan = split && assignment ? JSON.stringify([route, assignment]) : undefined;
    try {
      if (initial !== routeKey(route) || route.reasoningEffort !== undefined) {
        await actions.onboardingModel(undefined, 0, route, true);
        invalidateInheritedModelPlans();
        setInitial(routeKey(route));
        setPlanned(undefined);
      }
      if (tob !== undefined && plan !== planned) {
        const revision = (await actions.modelPlanState(tob)).revision ?? 0;
        if (split && assignment) {
          const effort = assignment.reasoningEffort ?? '';
          await actions.setModelPlan(tob, revision, route, assignment, [
            {
              provider: assignment.provider,
              model: assignment.model,
              allowedEfforts: [effort],
              defaultEffort: effort,
            },
          ]);
        } else await actions.inheritModel(tob, revision);
        setPlanned(plan);
      }
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };
  const bound = useMountedResource<HTMLSpanElement>(() => {
    bind({ save });
    return () => bind(undefined);
  }, [route, selected, initial, assignment, advanced, planned]);
  const options = models.map((model) => ({
    value: routeKey(model),
    label: model.modelName,
    hint: model.providerName + (model.credential ? ' · ' + t('onboarding.needsKey') : ''),
  }));
  const parse = ({ key, effort }: { key: string; effort: string }): ModelRouteView => {
    const [provider, model] = JSON.parse(key) as [string, string];
    return { provider, model, ...(effort ? { reasoningEffort: effort } : {}) };
  };
  return (
    <div ref={mount} className="bh-onboarding-model-form">
      <span ref={bound} hidden />
      <h2 {...stylex.props(styles.title)}>{t('intro.model.title')}</h2>
      <ModelPicker
        title={t('onboarding.model')}
        hint={t('intro.model.hint')}
        choice={{
          key: route ? routeKey(route) : '',
          effort: route?.reasoningEffort ?? '',
        }}
        catalog={models}
        options={options}
        onChange={(choice) => setRoute(parse(choice))}
        disabled={false}
        t={t}
      />
      {tob !== undefined ? (
        <details
          {...stylex.props(styles.advanced)}
          open={advanced}
          onToggle={(event) => setAdvanced(event.currentTarget.open)}
          data-intro-model-advanced
        >
          <summary {...stylex.props(styles.advancedSummary)}>
            <span>{t('intro.model.advanced')}</span>
            <span {...stylex.props(styles.copy)}>
              {t(split ? 'intro.model.advancedSplit' : 'intro.model.advancedSame')}
            </span>
          </summary>
          <ModelPicker
            title={t('modelPreset.assignment')}
            hint={t('intro.model.assignmentHint')}
            choice={{
              key: routeKey(assignment ?? route ?? { provider: '', model: '' }),
              effort: (assignment ?? route)?.reasoningEffort ?? '',
            }}
            catalog={models}
            options={options}
            onChange={(choice) => setAssignment(parse(choice))}
            disabled={false}
            t={t}
          />
        </details>
      ) : null}
      {!loaded ? <p role="status">{t('modelPreset.loading')}</p> : null}
      <SidebarCardList label={t('failure.openModels')}>
        <SidebarCardRow
          icon="settings"
          title={t('failure.openModels')}
          meta={
            selected?.credential || (loaded && models.length === 0)
              ? t('onboarding.keyHint')
              : t('onboarding.providerSettingsHint')
          }
          onClick={() => {
            hide(true);
            openModelsSettingsAndReturn(() => {
              hide(false);
              void load();
            });
          }}
        />
      </SidebarCardList>
      {error ? (
        <p role="alert" className="bh-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function routeKey(route: { provider: string; model: string }): string {
  return JSON.stringify([route.provider, route.model]);
}

function CommunityStep({ t }: { t: BotHarnessTranslate }): ReactElement {
  const [stars, setStars] = useState(cachedGithubStars);
  const [copied, setCopied] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const abort = new AbortController();
    void fetchGithubStars(abort.signal).then((count) => {
      if (count !== undefined && !abort.signal.aborted) setStars(count);
    });
    return () => abort.abort();
  }, []);
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  return (
    <div ref={mount} {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.heroCopy)}>
        <h2 {...stylex.props(styles.title)}>{t('intro.community.title')}</h2>
        <p {...stylex.props(styles.copy)}>{t('intro.community.hint')}</p>
      </div>
      <a
        href={COMMUNITY.github}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.link)}
        data-community="github"
      >
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="github" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.github')}</span>
          <span {...stylex.props(styles.copy)}>{t('intro.community.githubHint')}</span>
        </span>
        <span {...stylex.props(styles.stars)} data-github-stars={stars ?? ''}>
          <ChannelSidebarIcon name="star" size={14} />
          {stars === undefined
            ? t('intro.community.star')
            : t('intro.community.stars', { count: formatStars(stars, locale) })}
        </span>
      </a>
      <a
        href={COMMUNITY.discord}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.link)}
        data-community="discord"
      >
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="discord" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.discord')}</span>
          <span {...stylex.props(styles.copy)}>{t('intro.community.discordHint')}</span>
        </span>
        <ChannelSidebarIcon name="external-link" size={16} />
      </a>
      <div {...stylex.props(styles.link)} data-community="qq">
        <span {...stylex.props(styles.linkIcon)}>
          <CommunityIcon name="qq" />
        </span>
        <span {...stylex.props(styles.linkText)}>
          <span {...stylex.props(styles.linkTitle)}>{t('intro.community.qq')}</span>
          <span {...stylex.props(styles.copy)}>
            {t('intro.community.qqHint', { number: COMMUNITY.qqGroup })}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              .writeText(COMMUNITY.qqGroup)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          {t(copied ? 'intro.community.copied' : 'intro.community.copy')}
        </Button>
      </div>
    </div>
  );
}

function StartStep({
  t,
  pick,
}: {
  t: BotHarnessTranslate;
  pick(body: string | undefined): void;
}): ReactElement {
  return (
    <div {...stylex.props(styles.hero)}>
      <BotIcon icon="mascot" size={96} />
      <div {...stylex.props(styles.heroCopy)}>
        <h2 {...stylex.props(styles.title)}>{t('intro.start.title')}</h2>
        <p {...stylex.props(styles.copy)}>{t('intro.start.hint')}</p>
      </div>
      <div {...stylex.props(styles.starters)} role="list" aria-label={t('home.starters')}>
        {STARTERS.map((key) => (
          <button
            key={key}
            type="button"
            role="listitem"
            onClick={() => pick(t(key))}
            {...stylex.props(styles.link, styles.starter)}
          >
            <span {...stylex.props(styles.linkIcon)}>
              <ChannelSidebarIcon name="messages-circle" size={18} />
            </span>
            <span {...stylex.props(styles.linkText)}>{t(key)}</span>
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => pick(undefined)}>
        {t('intro.start.own')}
      </Button>
    </div>
  );
}
