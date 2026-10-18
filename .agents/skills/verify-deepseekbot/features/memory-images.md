# Version-bound Memory image and Markdown previews

## Sub-features

- Current `.png` files use the owning Memory reader, fit the available area, and enlarge through the existing image gallery.
- Working comparisons keep HEAD/index/worktree semantics; commit comparisons read the selected commit and first parent, including after a current file is deleted.
- Before/after panels stack on narrow Web viewports. Absent sides and unsupported, oversized or stale images have explicit states.
- The authenticated PNG route binds the owner, path, source and SHA-256 revision. `memory-image` exports the same bytes to a new file and prints one JSON receipt.

## How to get to it (user POV)

Enter Bot mode, select a disposable Bot DM in Channels and open Messages. Close Home if it obscures the review area. Use the Messages header switches to open Memory files and select a PNG. Open Memory evolution and select its working change or a commit. Close the side panels to give the reader more room; the selected reader stays open. Click a ready image to enlarge it, then press Escape. Refresh the reader if mutable image content changed.

## Driving it with verify-app

Launch and doctor a task-owned isolated instance. Run `node scripts/e2e-memory-images.mjs --name <name>` against the built slice. The journey creates or reuses one synthetic PersonaBot in that instance, writes three visibly different PNGs into its repository, makes two commits and leaves a working change. It uses accessible controls to inspect current, working and historical content, verifies native image decoding, captures light/dark and narrow Web screenshots, and compares nine direct CLI exports, including staged and unstaged versions, with the actual Git/current bytes. An unauthenticated image read and a stale-content CLI export must fail; temporary index/file changes are restored.

For before/after review, run `node scripts/e2e-memory-images.mjs --name <name> --before` against the base build, then rebuild and restart only that instance's exact PID with the same Profile. Run the normal journey after the change. Fixture state stays within that named instance; screenshots and each failed attempt remain under its ignored verification directory. Inspect screenshots, ARIA snapshots and the final verification report before publishing sanitized evidence. `verify-app stop` removes the temporary Profile but retains verification evidence.

## Gotchas

This is the first Web PNG slice of #2214. JPEG/GIF/WebP/SVG, editor/file-card previews and mobile remain follow-up work; the second Web Markdown slice is documented below. A supported header is not decoding proof: the browser journey checks `naturalWidth`. Source/CLI transport tests do not replace Web rendering or Human QA. No model reply is needed.

The current dock opens Channels and Messages independently; selecting a Channel while only Home is visible does not itself expose Memory controls. Use the Messages rail entry and its header switches. Image selection and diff source identities are separate from the existing Open current file action. All fixtures belong to the isolated test Host; never point this journey at an everyday or shared QA Profile.

At 700px, wait for the narrow shell to mount, select the Bot from its visible list, open Conversation settings, expand Memory, select the working change, then press Escape to close the overlay. Resizing remounts the conversation; a screenshot of the roster or an occluded old desktop view is not image evidence. The journey measures the two visible figure positions to prove stacking.

## Markdown documents (second Web slice)

Use the same Memory files, working change and commit entry points for `.md` / `.markdown`. Files default to rendered GFM documents; View source returns the original text. Diffs default to lines; Rendered preview displays the full Before and After documents, stacked on narrow Web viewports. Local inline PNGs follow the selected worktree/index/commit; relative paths start at the document directory, slash-prefixed paths at the repository root. Images are loaded when visible, expand through the existing gallery, and release temporary resources on source mode or navigation. Refresh reobserves mutable image dependencies.

Run `node scripts/e2e-memory-markdown.mjs --name <task-owned-instance>` after launch and doctor. It creates one synthetic Markdown Preview QA PersonaBot with two committed illustrated notes and a working change. The journey checks actual heading/table/image rendering, source and default line-diff behavior, working and first-parent historical image decoding, 700px stacked layout, enlargement/return, a missing-image result, nine CLI exports including staged/unstaged content, anonymous denial and stale-document refusal. It intercepts only the synthetic `https://preview.invalid/` image in the browser and serves fixture bytes with CORS: zero requests before the click and one after proves the consent boundary, not third-party server availability. Browser network restrictions on arbitrary external sites remain platform behavior.

For matched Before captures, build the base Client in a disposable baseline worktree, load it against a task-owned base Host with the same fixture, and run this journey with `--before`. Preserve both builds and first failures; restore the feature build and restart only the task Host without deleting its Profile. Inspect screenshots, ARIA, image byte comparisons and all unexpected console/page errors. Expected missing-image HTTP 404s are listed separately. No model call or native mobile check is needed for this Web journey.

Local inline PNGs keep the first slice's 25 MiB/dimension limits; Markdown bodies have independent 4 MiB limits. Other local formats, unsaved-editor and ordinary message-file previews, and native mobile remain later #2214 scope. Rendering does not execute raw HTML. HTTP/data/file/protocol-relative images stay inert; external HTTPS images require a per-image click, no referrer and anonymous cross-origin access. Historical missing images never fall back to current files.
