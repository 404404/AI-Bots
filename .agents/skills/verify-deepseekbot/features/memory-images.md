# Version-bound Memory PNG previews

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

This is the first Web PNG slice of #2214. JPEG/GIF/WebP/SVG, Markdown previews, editor/file-card previews and mobile remain follow-up work. A supported header is not decoding proof: the browser journey checks `naturalWidth`. Source/CLI transport tests do not replace Web rendering or Human QA. No model reply is needed.

The current dock opens Channels and Messages independently; selecting a Channel while only Home is visible does not itself expose Memory controls. Use the Messages rail entry and its header switches. Image selection and diff source identities are separate from the existing Open current file action. All fixtures belong to the isolated test Host; never point this journey at an everyday or shared QA Profile.

At 700px, wait for the narrow shell to mount, select the Bot from its visible list, open Conversation settings, expand Memory, select the working change, then press Escape to close the overlay. Resizing remounts the conversation; a screenshot of the roster or an occluded old desktop view is not image evidence. The journey measures the two visible figure positions to prove stacking.
