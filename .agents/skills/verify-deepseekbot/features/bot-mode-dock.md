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

Enter Bot mode. Use the rail’s panel switches, grip menu, bottom settings control and top DSB exit control. Drag Channel headers to rearrange panels. Bot Settings → Workspace layout contains the continuous spacing slider and Reset layout. The grip retains its original icon/button styling above Settings, hidden until hover or keyboard focus. Channels header owns Search, list options and Create; expanded Search aligns both edges with Channel row backgrounds without clipping, including narrow panels; the windowed macOS top-left header retains its traffic-light clearance; the body does not repeat the Messages heading. Workspace panel headers have no close buttons: use rail switches. Right-click a Bot DM, verify the menu tracks viewport pointer coordinates and opens View profile; Chinese shows 频道列表 and 查看资料.

## Driving it with verify-app

Launch a task-owned rc.2 Host and run doctor. Then run:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-panel-workspace.mjs
```

The script enters Bot mode, presses the sidebar shortcut, moves the rail right and between columns, drags Channels (Web), changes gap to 0/16/12, reorders rail switches, closes and reopens Channels and Messages, opens Activity Center, refreshes, verifies proportional resizing (Web), crosses the narrow threshold and exits. It checks visible geometry, canonical localStorage and restored native sidebar width, and saves screenshots, results and page errors in a unique attempt directory.

For native macOS, install the task Bundle into a separate rc.2 Desktop Profile and connect with `BH_DESKTOP_CDP=http://127.0.0.1:<task-debug-port>` using the same command. This uses the existing `dsh-app:` page; never navigate the native window to a Web URL or fake `data-platform`. Desktop diagnostics availability differs from the Web verification launcher, so native proof uses actual UI, geometry and localStorage. Keep the task Desktop foreground: rc.2 deliberately ignores native shortcuts from an unfocused app. Desktop defaults to ⌘B; macOS Web uses ⌘⌥B. Customized bindings, traffic-light hit targets, fullscreen and window dragging need supplemental native checks. A Web group fixture must open Members from the Messages header, resize the inner split, then reload and verify the saved ratio. Drag the visible Window Companion and confirm the existing message DOM stays connected. rc.2 has no sidebar-toggle menu item; do not claim a nonexistent menu path.

## Gotchas

- A successful layout command unit test is not proof of native shortcut dispatch. Preserve native failures separately from Web evidence.
- Select the visible `.bh-workspace-rail` when querying pinned cards: the fallback sidebar remains mounted but hidden.
- The slider and its SettingsRow share an accessible name; target the slider role/input rather than the group.
- Human feedback is required after this slice before extending the full panel matrix. Windows and Linux Desktop are not qualified by macOS evidence.
- Legacy `scripts/e2e-bot-mode-sidebar.mjs` tests the old fallback surface. Use the workspace journey for the qualified wide-shell path.
