# macOS product zoom delivery evidence

The source commit is recorded in `validation.json`. This supplements the earlier S1 native acceptance and the wallpaper/chrome evidence in PRs #2294/#2295.

The prepared product tarballs were installed into fresh Profiles for both supported Host versions, created a Bot and DM, and survived a real Host restart. The product-carried theme imports outside the workspace without `node_modules`. Reinstall, a local-version upgrade and rollback kept the same canonical Bot identity and one theme module. Explicit Bundle disable and package removal restored the native theme without a compatibility marker.

The existing native window booted using ordinary product Bundle patches after its task-only theme override was removed. Native shortcut recording rejected a conflict without changing zoom; a temporary custom binding changed the composer window by exactly one level and retained its synthetic draft, then was reset. This is distinct from a packed native install, real IME, Host switching and manual font preservation.

No new view is introduced by this packaging change. Comparable new install screenshots remain pending: the preserved native window is intentionally held for the requested physical IME check, and browser approval rejected the separate fresh-product Web origin. No browser/CDP workaround was attempted. Runnable review path: build the branch, prepare the product tarballs using the pinned Provider, install and enable the Bundle in a fresh macOS 0.2.1-rc.2 Desktop Profile, then inspect General → Window zoom and the single native theme id in the startup graph. Retain the primary user-data when switching Hosts; do not substitute reconnection for Host-switch proof.

Neither #2268 nor #2269 is claimed fully accepted by this record. Windows/Linux are deferred to the Human handoff in #2270. No new PR is merged and no release is published.
