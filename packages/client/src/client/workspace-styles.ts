import { border, color, radius, size, space } from './ds/tokens.stylex.js';

const panelBackground = `color-mix(in srgb, ${color.base} 85%, ${color.surface})`;

export const WORKSPACE_CSS = `
.bh-workspace-mount { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; height:100%; }
[data-bh-workspace-frame] > [data-bh-workspace-sidebar],
[data-bh-workspace-frame] > [data-side="sidebar"],
[data-bh-workspace-frame] > [data-shell-leading] { display:none !important; }
[data-bh-workspace-frame] > [data-bh-workspace-main] { grid-column:1 / 3; grid-row:1; border-left:0 !important; }
[data-bh-workspace-frame] > [data-rightbar-col] { grid-column:3; grid-row:1; }
.bh-workspace-chrome { display:none; }
[data-bh-workspace-main] { --dsh-frame-leading-clearance:0px; }
html[data-platform="darwin"]:not([data-fullscreen]) [data-workspace-enabled] > .bh-workspace-chrome { display:block; position:absolute; top:0; left:0; width:calc(${size.nav} * 2 + ${space.x3}); height:${size.nav}; z-index:10; background:${color.base}; }
.bh-dock[data-workspace-dock] .dv-groupview { border-radius:${radius.xs}; corner-shape:round; overflow:hidden; }
.bh-dock[data-workspace-dock] .bh-root { background:${panelBackground}; }
html[data-platform="darwin"]:not([data-fullscreen]) .bh-dock:has([data-bh-rail-corner]) .bh-workspace-rail { padding-top:calc(${size.nav} + ${space.x2}); }
html[data-platform="darwin"]:not([data-fullscreen]) [data-bh-mac-corner] .bh-dock-header,
html[data-platform="darwin"]:not([data-fullscreen]) [data-bh-mac-corner] .bh-topbar { padding-left:var(--bh-mac-leading); box-sizing:border-box; }
.bh-dock[data-workspace-dock] .dv-dockview { background:${color.base}; }
.bh-dock[data-workspace-dock] { box-sizing:border-box; background:${color.base}; }
.bh-dock[data-workspace-dock] .dv-tabs-and-actions-container { border-bottom:var(--bh-workspace-header-gap) solid ${color.base}; }
[data-workspace-dock] .bh-dock-menu, [data-workspace-dock] [data-panel-empty-action] { display:none; }
[data-workspace-dock] .bh-dock-theme { --dv-activegroup-visiblepanel-tab-background-color:${panelBackground}; --dv-inactivegroup-visiblepanel-tab-background-color:${panelBackground}; --dv-separator-border:transparent; --dv-paneview-header-border-color:transparent; --dv-group-view-background-color:${panelBackground}; --dv-tabs-and-actions-container-background-color:${panelBackground}; }
.bh-workspace-rail { border-radius:${radius.xs}; corner-shape:round; overflow:hidden; position:relative; height:100%; display:flex; flex-direction:column; align-items:center; gap:${space.x2}; padding:${space.x2}; box-sizing:border-box; background:${panelBackground}; }
.bh-workspace-rail > button, .bh-workspace-rail > span > button, .bh-workspace-move { display:flex; align-items:center; justify-content:center; flex-shrink:0; width:${size.row}; height:${size.row}; padding:0; border:0; border-radius:${radius.md}; corner-shape:round; color:${color.fg}; background:transparent; cursor:pointer; }
.bh-workspace-rail button:hover { background:${color.hover}; }
.bh-workspace-rail button:focus-visible { outline:${border.focus} solid ${color.accent}; outline-offset:calc(-1 * ${space.x1}); }
.bh-workspace-grip { opacity:0; transition:opacity 120ms; }
.bh-workspace-rail:hover .bh-workspace-grip, .bh-workspace-rail:focus-within .bh-workspace-grip { opacity:1; }
.bh-workspace-controls { min-height:0; flex:1; overflow:auto; width:100%; }
.bh-workspace-controls .bh-pinned-panels { margin:0; padding:0; }
.bh-workspace-exit-icon { display:none; color:${color.danger}; }
.bh-workspace-exit:hover .bh-workspace-brand, .bh-workspace-exit:focus-visible .bh-workspace-brand { display:none; }
.bh-workspace-exit:hover .bh-workspace-exit-icon, .bh-workspace-exit:focus-visible .bh-workspace-exit-icon { display:flex; }
.bh-workspace-channel-actions { display:flex; align-items:center; min-width:0; }
.bh-workspace-channel-actions .bh-header { margin:0; padding:0; height:auto; }
.bh-dock-header:has(.bh-search-open) [data-panel-head] { display:none !important; }
.bh-dock-header:has(.bh-search-open) > div > span, .bh-dock-header:has(.bh-search-open) .bh-workspace-channel-actions, .bh-dock-header:has(.bh-search-open) .bh-header, .bh-dock-header:has(.bh-search-open) [data-dock-actions] { flex:1; min-width:0; }
.bh-workspace-channels { display:flex; flex-direction:column; height:100%; min-height:0; }
[data-dock-panel="bh:channels"] > [data-dock-panel-body] { overflow:hidden; }
.bh-workspace-channels > .bh-region { flex:1; min-height:0; padding:0; }
.bh-workspace-channels .bh-region:has(> [data-panel-empty]) .bh-roster-list:empty { display:none; }
.bh-workspace-drop { position:absolute; top:0; bottom:0; width:${space.x1}; background:${color.accent}; z-index:1000; pointer-events:none; }
.bh-message-split { display:flex; height:100%; min-height:0; }
.bh-message-content { display:flex; flex-direction:column; flex:1; min-width:0; min-height:0; }
.bh-message-members { display:flex; flex-direction:column; min-width:0; min-height:0; }
.bh-message-members > section { flex:1; min-height:0; overflow:auto; }
.bh-message-member-divider { flex:0 0 var(--bh-workspace-gap); min-width:${space.x2}; background:${color.base}; cursor:col-resize; touch-action:none; }
.bh-message-member-divider:focus-visible { outline:${border.focus} solid ${color.accent}; outline-offset:calc(-1 * ${space.x1}); }
`;
