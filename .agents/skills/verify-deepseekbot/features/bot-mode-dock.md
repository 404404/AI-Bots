# Bot mode workspace and dock

At 961px and wider on a qualified rc.2 Web/macOS shell, the workspace contains a full-height control rail, independent Channel list, one closable Messages panel and Dock panels. Unsupported shells and Windows captions keep the legacy sidebar/dock fallback.

## Sub-features

- `workspace-shell`: native sidebar allocation is released only in Bot mode and restored on exit, narrow layout or disposal.
- `control-rail`: exactly one nonclosable full-height rail; move left/right/between root columns using its grip/menu. No half-height, tabs or floating placement.
- `channel-list`: global panel retains Roster selection and actions; close/reopen remembers its neighbor.
- `shortcuts`: native sidebar command toggles the Channel list while active, and resumes native behavior after exit. DSH keyboard settings customize each panel command; verify a changed binding after reload, then reset it in the isolated profile.
- `spacing`: continuous 0–16px slider, default 4px; original dark background, slightly lighter panels, small round corners and a smaller header/body gap.
- `persist`: version 2 of `botharness.bot-mode-layout` holds proportional geometry, parked panels, gap, switch order and member split preferences; v1 migrates without discarding custom layout.
- `messages`: close/reopen and refresh preserve visibility; group header opens Members as an internal resizable split, absent in DMs.
- `switch-order`: drag switches or use Alt+Up/Down; order survives refresh.
- `live-content`: moving rail/panels or dragging the companion preserves mounted content and unsent drafts.
- `empty-states`: Sessions, Inbox, Channels search, files, schedules, group work and Messages use a centered panel icon above their description; loading/errors stay distinct. Workspace content has 2px on each side, with no doubled native-sidebar inset. Check empty → populated and window resizing.
- `global-panels`: Activity Center opens before or after selecting a Channel. Channel-scoped panels without a Channel show an empty state.
- `macos-chrome`: only the traffic-light corner gets clearance; other panels start at the top. Move the rail to every column and verify native window dragging, fullscreen and restored native layout.
- `fallback`: below 961px retain the responsive UI without overwriting the saved workspace.

## How to get to it (user POV)

Enter Bot mode. Use the rail’s panel switches, grip menu, bottom settings control and top DSB exit control. Drag Channel headers to rearrange panels. Bot Settings → Appearance → Workspace layout contains the continuous spacing slider and Reset layout. The grip retains its original icon/button styling above Settings, hidden until hover or keyboard focus. Channels header owns Search, list options and Create; expanded Search aligns both edges with Channel row backgrounds without clipping, including narrow panels; the windowed macOS top-left header retains its traffic-light clearance; the body does not repeat the Messages heading. Workspace panel headers have no close buttons: use rail switches. Right-click a Bot DM, verify the menu tracks viewport pointer coordinates and opens the full profile detail view directly; repeat with Messages closed and verify it reopens and activates with the requested Bot. The header’s View profile opens the same detail view without a popover or profile-card pin controls; Back/Escape returns to chat. Chinese shows 频道列表 and 查看资料.

## Driving it with verify-app

Launch a task-owned rc.2 Host and run doctor. Seed one Bot DM and one Group Channel so Alt+1/2 can exercise distinct Channels. Then run:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-panel-workspace.mjs
```

The script enters Bot mode, presses the sidebar shortcut, moves the rail right and between columns, drags Channels (Web), changes gap to 0/16/12, reorders rail switches with a visible insertion line and dimmed dragged switch (including a drop after the last switch), closes and reopens Channels and Messages, opens Activity Center, refreshes, verifies proportional resizing (Web), crosses the narrow threshold and exits. It checks visible geometry, canonical localStorage and restored native sidebar width, and saves screenshots, results and page errors in a unique attempt directory.

For native macOS, install the task Bundle into a separate rc.2 Desktop Profile and connect with `BH_DESKTOP_CDP=http://127.0.0.1:<task-debug-port>` using the same command. This uses the existing `dsh-app:` page; never navigate the native window to a Web URL or fake `data-platform`. Desktop diagnostics availability differs from the Web verification launcher, so native proof uses actual UI, geometry and localStorage. Keep the task Desktop foreground: rc.2 deliberately ignores native shortcuts from an unfocused app. Desktop defaults to ⌘B; macOS Web uses ⌘⌥B. Customized bindings, traffic-light hit targets, fullscreen and window dragging need supplemental native checks. A Web group fixture must open Members from the Messages header, resize the inner split, then reload and verify the saved ratio. Drag the visible Window Companion and confirm the existing message DOM stays connected. rc.2 has no sidebar-toggle menu item; do not claim a nonexistent menu path.

## Gotchas

- A successful layout command unit test is not proof of native shortcut dispatch. Preserve native failures separately from Web evidence.
- Select the visible `.bh-workspace-rail` when querying pinned cards: the fallback sidebar remains mounted but hidden.
- The slider and its SettingsRow share an accessible name; target the slider role/input rather than the group.
- Human feedback is required after this slice before extending the full panel matrix. Windows and Linux Desktop are not qualified by macOS evidence.
- Legacy `scripts/e2e-bot-mode-sidebar.mjs` tests the old fallback surface. Use the workspace journey for the qualified wide-shell path.

- When reordering rail switches, check both themes: the blue insertion line tracks the upper/lower half and gaps, clears on leaving or cancelling, and never toggles a Panel. Alt+Up/Down remains available; refresh preserves the resulting order.

- `channel-switch-stability`: Alt+1/2 and roster clicks change the active Channel without replacing the control rail, Channel list or Activity Center DOM. Channel-specific transient search/menu/profile state resets; per-Channel drafts stay separate. Test loading → ready and repeated store updates as well as switching back.


- `settings-navigation`: the rail gear opens Bot Settings. Search its sidebar for “spacing” / “间距” from General, select the result, and verify Appearance scrolls to the highlighted slider. Search results must only reference registered pages. Repeat at 600px using the same search above the page picker; no horizontal overflow.
- `settings-preferences`: Appearance owns the DSH-native Light/Dark/System preference and language, plus motion, Bot icon and layout. Change theme/language and reload to verify native persistence. Messaging owns default name, Enter/Shift+Enter/Ctrl-or-Command+Enter send behavior, and IM defaults; it no longer repeats Channel sorting. Notifications has its own page. Browser/Computer navigation is 浏览器控制/电脑控制 in Chinese.
- `settings-shortcuts`: open Keyboard shortcuts, filter Panel and conversation commands, edit a Panel binding, reload and verify its keycaps and dispatch, then reset. Conflicts/reserved keys and failed saves must retain the accepted binding. Bot help shortcut opens this page without a second modal. Native recorder interception still requires actual Desktop qualification.
- `settings-tour`: General → Onboarding tutorial → Show me around starts driver.js over the Control Rail, Channels, Messages, workspace resizing and additional Panels. Hidden Channels/Messages use their visible rail switches as targets. Finishing or cancelling returns control; narrow layout retains its original tutorial.

- `panel-visibility-menus`: right-click the Control Rail (or Shift+F10 while focused). Each row has the Panel icon, label and trailing checked/unchecked box. Hiding Sessions removes its switch and closes its Panel without replacing Messages; refresh preserves the hidden choice. Checking it again restores only the switch; click it to reopen the Panel. Right-click a Panel header → Close removes the Panel but retains its switch. Escape cancels either menu. Hover a switch to see its name and native shortcut keycaps outside the rail; edit the binding in Keyboard shortcuts and confirm both the tooltip and actual dispatch update. Reset layout restores all default switches.

- `pointer-menu-position`: the workspace script measures Panel-header and Channel-row menus at 100% / 125% CSS zoom (within one rendered pixel), then right/bottom edge clamping and Escape dismissal. Native Desktop positioning is separately qualified. Every Control Rail Panel is opened in turn: verify its header menu at normal scale, Escape focus restoration, Shift+F10 anchoring, and Close removing only that Panel while keeping its switch and parked layout position. Other Panel headers must stay mounted. All pointer menus share `ds/PointerMenu`; feature code must not correct coordinates locally.

- `scrollbar-activity`: scroll Messages and another overflow area independently. The active thumb appears immediately, begins fading after 800ms and is hidden by 1000ms; hover alone does not reveal it. Verify no content-width shift, a second scroll cancels the previous fade, reduced motion skips interpolation, and native dragging still works. Check light/dark and leave Bot mode to verify cleanup. The workspace journey asserts numeric thumb visibility and DOM identity.

For headless scrollbar evidence, launch Puppeteer with `ignoreDefaultArgs: ['--hide-scrollbars']`: its default flag suppresses painted native thumbs and native dragging even when computed thumb colors look correct. Compare actual scrolling/idle screenshots as well as computed alpha and geometry.

- `channel-files`: select a DM, then open Channel files from the Messages header. It is a transient inner split, not a Dock panel or rail switch. Verify Human and Bot attachments, older history, preview and Reference/Unreference with a preserved draft. Repeat in a Group with files from multiple authors, without selecting a Bot; switch between Members and Channel files and resize the shared divider. Closing the list stops history loading. Switch Channels and verify the list closes and reopens with only that Channel's files. At a narrow width or in the legacy shell, the chat header opens the same list in a dismissible dialog. Check empty, retry and purged-file states; restoring a saved layout with the old `generated-files` panel must remove that panel without discarding other panel geometry.

- `channel-files-compact`: the file list body has zero padding and each row owns its content inset. File name/size and icon actions share one row when space permits; narrow the inner split until the whole action group wraps to a second row, still aligned to the trailing edge. Verify Reference/Unreference accessible names and selected state, image preview, download, keyboard focus and both themes.


- `bot-inbox-header`: select a PersonaBot DM and open Bot Inbox from the Messages header. The transient inner split has no outer body padding and preserves grouping, count, source navigation and pagination. It is the selected Bot's complete Inbox, including admitted Group/system sources. Verify empty/loading/error-retry states, preserved composer drafts, files/Inbox exclusivity, old `bot-inbox` layout pruning and the existing Inbox shortcut reopening Messages. Selecting a Group removes the entry and closes the split. Narrow Web opens the same Inbox in a dismissible dialog. Activity Center repair fallback requests the Inbox view of that Bot directly. Cross-check a real DM reply with the matching canonical Bot Inbox Admission; no Group Inbox is introduced.
