export const COMPOSER_CONTEXT_CSS = `
.bh-composer-context {display:flex;flex-wrap:wrap;gap:4px;padding:6px 4px 0;align-items:center;min-width:0;}
.bh-composer-context button {font:inherit;font-size:12px;line-height:20px;min-height:28px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.bh-composer-context button:hover,.bh-composer-context button:focus-visible {background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.bh-composer-shortcuts {position:absolute;bottom:100%;left:0;right:0;z-index:4;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.bh-composer-shortcuts button {display:flex;justify-content:space-between;gap:8px;align-items:center;font:inherit;text-align:start;padding:8px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;}
.bh-composer-shortcuts button[data-active='true'],.bh-composer-shortcuts button:hover {background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-shortcuts button:disabled {color:var(--dsw-alias-label-tertiary);cursor:default;}
.bh-composer-shortcuts small {color:var(--dsw-alias-label-secondary);}
`;
