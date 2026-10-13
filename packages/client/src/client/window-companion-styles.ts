export const WINDOW_COMPANION_CSS = `
.bh-companion-stage {
  /* @bh-companion-aliases:start — pixel geometry over native DSH surfaces. */
  --bh-companion-surface: var(--dsw-alias-bg-base);
  --bh-companion-text: var(--dsw-alias-label-primary);
  --bh-companion-muted: var(--dsw-alias-label-secondary);
  --bh-companion-border: var(--dsw-alias-border-l2);
  --bh-companion-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-companion-attention: var(--dsw-alias-state-warn-primary);
  --bh-companion-font: var(--dsw-font-markdown-code-block-font-family);
  /* @bh-companion-aliases:end */
  /* Focus may scroll hidden overflow; the presentation viewport must stay fixed. */
  position: absolute; inset: 0; pointer-events: none; overflow: clip;
}
.bh-companion-chip { display: inline-flex; align-items: center; gap: 2px; }
.bh-channel-island-wrap > .bh-companion-pin { margin-left: 2px; }
.bh-channel-island-wrap > .bh-companion-pin { width: 34px; height: 34px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-module-platform); box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.bh-channel-island-wrap > .bh-companion-pin:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, var(--dsw-alias-bg-module-platform)); }
.bh-companion-pin { display: inline-grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; background: transparent; color: var(--bh-overview-muted); border-radius: var(--bh-overview-radius-control); cursor: pointer; opacity: 0; transition: opacity 150ms ease; }
.bh-companion-chip:hover .bh-companion-pin, .bh-channel-island-wrap:hover > .bh-companion-pin, .bh-companion-pin:focus-visible, .bh-companion-pin[aria-pressed='true'] { opacity: 1; }
.bh-companion-pin:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-companion-pin:disabled { cursor: default; }
.bh-companion-capacity-controls { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.bh-companion-capacity-controls label { display: grid; gap: 4px; max-width: 150px; }
.bh-companion { position: absolute; width: 96px; height: 96px; pointer-events: auto; }
.bh-companion-tether { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bh-companion-tether path { fill: none; stroke: var(--bh-companion-border); stroke-width: 2; stroke-linejoin: miter; }
.bh-companion-character { border: 0; padding: 0; background: transparent; cursor: grab; touch-action: none; width: 96px; height: 96px; transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion-character:active { cursor: grabbing; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 3px; }
.bh-companion[data-sync='stale'] .bh-companion-character { opacity: 0.55; filter: grayscale(1); }
.bh-companion-bubble { position: absolute; display: flex; flex-direction: column; width: 300px; max-width: calc(100vw - 16px); padding: 6px 10px 8px; background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-border); color: var(--bh-companion-text); box-shadow: 3px 3px 0 var(--bh-companion-border); }
.bh-companion-bubble header, .bh-companion-pending > header { display: flex; align-items: center; gap: 6px; min-width: 0; }
.bh-companion-source { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }
.bh-companion-source small { font: 11px/14px var(--bh-companion-font); color: var(--bh-companion-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-source button { text-align: left; line-height: 14px; }
.bh-companion-source button:disabled { cursor: default; }
.bh-companion-bubble header button { font-size: 11px; color: var(--bh-companion-muted); background: transparent; border: 0; padding: 0; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-queue { flex: none; font: 11px/14px var(--bh-companion-font); color: var(--bh-companion-muted); }
.bh-companion-bubble p { margin: 4px 0 0; font: 12px/18px var(--bh-companion-font); white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; max-height: 72px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; overflow-anchor: none; scroll-behavior: auto; }
.bh-companion[data-reading='true'] .bh-companion-bubble p { max-height: 216px; }
.bh-companion-bubble p::-webkit-scrollbar { display: none; }
.bh-companion-bubble p:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-companion-pending { position: absolute; z-index: 3; display: flex; flex-direction: column; width: 300px; max-width: calc(100vw - 16px); background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-border); color: var(--bh-companion-text); box-shadow: 3px 3px 0 var(--bh-companion-border); }
.bh-companion-pending > header { flex: none; padding: 6px 10px 0; font: 11px/16px var(--bh-companion-font); color: var(--bh-companion-muted); }
.bh-companion-pending > ol { margin: 0; padding: 6px 10px 10px; list-style: none; overflow: auto; scrollbar-width: thin; }
.bh-companion-request-source { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-request-nav { display: inline-flex; flex: none; align-items: center; gap: 2px; }
.bh-companion-request-nav button { width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: var(--bh-companion-text); cursor: pointer; font: inherit; }
.bh-companion-request-nav button:hover { background: var(--bh-companion-hover); }
.bh-companion-pending [data-compact] { --bh-message-card-gap: 6px; width: auto; min-width: 0; font-size: 12px; }
.bh-companion-pending [data-compact] .bh-message-card-actions { gap: 6px; padding-top: 2px; }
.bh-companion-pending [data-compact] .bh-message-card-list .bh-card-main { min-height: 30px; }
.bh-companion-details { font-size: 12px; color: var(--bh-companion-muted); }
.bh-companion-details > summary { cursor: pointer; width: max-content; }
.bh-companion-details[open] { display: grid; gap: 4px; }
.bh-companion-pending .bh-tool-approval-card { margin: 0; min-width: 0; grid-template-columns: minmax(0, 1fr); overflow-wrap: anywhere; }
.bh-companion-pending .bh-tool-approval-input { max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-companion-toolbar { position: absolute; bottom: 96px; left: -10px; display: flex; align-items: center; gap: 4px; padding: 5px; background: var(--bh-companion-surface); border: 1px solid var(--bh-companion-border); }
.bh-companion-toolbar button { display: grid; place-items: center; min-width: 28px; height: 26px; border: 0; background: transparent; color: var(--bh-companion-text); cursor: pointer; }
.bh-companion-toolbar button:hover { background: var(--bh-companion-hover); }
.bh-companion-attention { position: absolute; z-index: 2; right: 4px; top: 4px; min-width: 20px; height: 20px; padding: 0 3px; border: 1px solid var(--bh-companion-border); background: var(--bh-companion-surface); color: var(--bh-companion-attention); cursor: pointer; }
.bh-companion-toolbar, .bh-companion-attention { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 150ms ease, visibility 0s linear 150ms; }
.bh-companion:hover .bh-companion-toolbar, .bh-companion:has(:focus-visible) .bh-companion-toolbar,
.bh-companion:hover .bh-companion-attention, .bh-companion:has(:focus-visible) .bh-companion-attention,
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
`;
