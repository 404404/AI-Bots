export const MOBILE_BOT_CSS = `
[data-bh-mobile-sidebar='true'] { display: none !important; }
.bh-mobile-shell { position: fixed; inset: var(--bh-mobile-top, 0px) 0 auto; height: var(--bh-mobile-height, 100dvh); z-index: 10; display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--dsw-alias-bg-base); padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }
.bh-mobile-header { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; padding: max(4px, env(safe-area-inset-top)) 8px 4px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.bh-mobile-header button, .bh-mobile-nav button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.bh-mobile-header button { padding: 6px 10px; }
.bh-mobile-header button:focus-visible, .bh-mobile-nav button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-mobile-header button:hover, .bh-mobile-nav button:hover, .bh-mobile-nav button[aria-current='page'] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-mobile-list, .bh-mobile-content { flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.bh-mobile-list[hidden], .bh-mobile-content[hidden] { display: none; }
.bh-mobile-list > .bh-region { padding: 8px 12px; }
.bh-mobile-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px 8px max(4px, env(safe-area-inset-bottom)); border-top: 1px solid var(--dsw-alias-border-l2); }
.bh-mobile-nav button { padding: 6px 4px; overflow-wrap: anywhere; }
.bh-mobile-content .bh-main, .bh-mobile-content .bh-chat-layout, .bh-mobile-content .bh-chat-pane { min-width: 0; }
.bh-mobile-content .bh-composer-shell { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
.bh-mobile-content .bh-channel-island-wrap { min-width: 0; max-width: 100%; }
.bh-mobile-content .bh-channel-island { min-width: 0; }
`;
