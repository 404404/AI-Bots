export const COMPOSER_CONTEXT_CSS = `
.bh-composer-context {display:flex;gap:8px;padding:6px 4px 0;align-items:center;justify-content:space-between;min-width:0;}
.bh-composer-context-left {display:flex;flex-wrap:wrap;gap:4px;min-width:0;flex:1;}
.bh-composer-context-left button {min-width:0;flex:0 1 auto;}
.bh-composer-context .bh-composer-usage {margin-inline-start:auto;flex-shrink:0;}
.bh-composer-context button {display:inline-flex;align-items:center;gap:5px;}
.bh-composer-context button svg {flex-shrink:0;}
.bh-composer-context button span {overflow:hidden;text-overflow:ellipsis;}
.bh-composer-context button {font:inherit;font-size:12px;line-height:20px;min-height:28px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.bh-composer-context button:hover,.bh-composer-context button:focus-visible {background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.bh-composer-shortcuts {position:absolute;bottom:100%;left:0;right:0;z-index:4;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.bh-composer-shortcuts button {display:flex;justify-content:space-between;gap:8px;align-items:center;font:inherit;text-align:start;padding:8px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;}
.bh-composer-shortcuts button[data-active='true'],.bh-composer-shortcuts button:hover {background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-shortcuts button:disabled {color:var(--dsw-alias-label-tertiary);cursor:default;}
.bh-composer-shortcuts small {color:var(--dsw-alias-label-secondary);}
.bh-composer-shortcut-label {display:flex;align-items:center;gap:8px;}
.bh-composer-shortcut-label svg {flex-shrink:0;}
.bh-composer-usage-popover {position:fixed;z-index:1000;max-height:min(70vh,480px);overflow:auto;box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 32px color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent);font-size:13px;line-height:1.5;}
.bh-composer-usage-head,.bh-composer-usage-total,.bh-composer-usage-row {display:flex;gap:8px;align-items:center;justify-content:space-between;}
.bh-composer-usage-head {margin-bottom:12px;}
.bh-composer-usage-popover button {font:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:6px;padding:4px;}
.bh-composer-usage-popover button:hover,.bh-composer-usage-popover button:focus-visible {background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-usage-caption {font-size:12px;color:var(--dsw-alias-label-secondary);margin:6px 0 12px;}
.bh-composer-usage-section {padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2);}
.bh-composer-usage-section h3 {font:inherit;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);margin:0 0 8px;}
.bh-composer-usage-row {padding:6px 0;}
.bh-composer-usage-row span {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-composer-usage-row strong {font-weight:500;flex-shrink:0;font-variant-numeric:tabular-nums;}
.bh-composer-usage-popover .bh-composer-usage-details {width:100%;margin-top:8px;padding:12px 0 0;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0;}
`;
