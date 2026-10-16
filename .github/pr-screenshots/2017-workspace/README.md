# Workspace Control Rail — #2017

- Base: `0fbb4505c3339f28b5c92196e0276c952c631b1f`; `before-web.png` is the real baseline Client, not a mockup.
- Web: isolated DSH 0.2.0-rc.2 Host, Chromium, English, dark, 1440 × 900. `after-web.png` shows the same default Bot welcome view; `settings.png` shows the new section in Bot Settings. Supplemental group fixtures are synthetic and contain no sent messages. The baseline model/session projections were still loading at capture; these are not layout evidence.
- `after-macos.png`: actual rc.2 Desktop `dsh-app:` content, Chinese, dark, 1280 × 820 at 2×. CDP captures web content, not macOS traffic-light pixels. Native keyboard, fullscreen, exit hit-testing and window movement were separately exercised in the actual app.
- The baseline Desktop recapture could not complete: swapping the built baseline into the task profile caused a native boot failure/target closure. No comparable native before image is claimed. Review the current native content and repeat entering/exiting Bot mode in rc.2; Web before/after is the comparable pair.
- `group-members.png`: new internal Messages split, resized to approximately 40%, retained after refresh. This surface has no equivalent baseline panel arrangement; the prior standalone panel is represented by the baseline rail's Members switch.

Runtime checks: native sidebar allocation and restoration; rail left/middle/right; switch drag ordering; panel drag node identity; continuous 0/16/12px spacing; Messages close/reopen and refresh; Web proportional resize; narrow fallback; all panels closed with a 56px rail; companion drag retaining the message node; group-member split persistence; native custom shortcut after reload/reset; native fullscreen clearance and window drag. Light-theme Web was also inspected.

The complete platform matrix, Windows/Linux Desktop, embedded Browser/Computer state during movement, and final Human QA remain separate. This PR does not merge or deploy the workspace.
