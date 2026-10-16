import { color, radius, space, text } from './ds/tokens.stylex.js';

export const ACTIVITY_INBOX_CSS = `
.bh-activity-triage > .bh-human-inbox { padding: 0 ${space.x5} ${space.x6}; }
.bh-activity-triage .bh-activity-inbox { max-width: 760px; }
.bh-activity-triage.bh-activity-center-panel > .bh-human-inbox { padding: 0; }
.bh-activity-triage .bh-human-inbox-workspace { display: block; }
.bh-activity-triage .bh-human-inbox-detail { grid-column: 1 / -1; min-width: 0; }
.bh-activity-toolbar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: ${space.x2}; padding: ${space.x4} 0; background: ${color.base}; }
.bh-activity-toolbar h2 { flex: 1; margin: 0; font-size: ${text.titleSize}; line-height: ${text.titleLine}; font-weight: ${text.strong}; }
.bh-activity-approval { display: grid; grid-template-rows: 1fr; margin-bottom: ${space.x4}; min-width: 0; }
.bh-activity-approval-clip { min-height: 0; min-width: 0; }
.bh-activity-approval-content { min-height: 0; min-width: 0; padding: ${space.x5}; border-radius: ${radius.lg}; background: ${color.surface}; }
.bh-activity-approval-heading { display: flex; align-items: center; gap: ${space.x3}; margin-bottom: ${space.x4}; }
.bh-activity-approval-heading > div { display: grid; flex: 1; min-width: 0; }
.bh-activity-approval-heading strong { font-weight: ${text.strong}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; }
.bh-activity-approval-heading span, .bh-activity-approval-heading time { color: ${color.muted}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; overflow-wrap: anywhere; }
.bh-activity-approval .bh-tool-approval-card { min-width: 0; }
.bh-activity-approval-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: ${space.x3}; padding-top: ${space.x3}; }
.bh-activity-approval .bh-human-inbox-reply { margin-top: ${space.x4}; background: ${color.well}; min-width: 0; }
.bh-activity-approval[data-leaving] { animation: bh-activity-exit 220ms ease-out forwards; pointer-events: none; }
.bh-activity-approval[data-leaving] > div { overflow: hidden; }
@keyframes bh-activity-exit { to { opacity: 0; grid-template-rows: 0fr; margin-bottom: 0; } }
html[data-botharness-motion='reduce'] .bh-activity-approval[data-leaving] { animation-duration: 1ms; }
`;
