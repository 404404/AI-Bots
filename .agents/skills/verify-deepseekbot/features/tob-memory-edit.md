# Tob reviewed Soul and Memory edits

## Sub-features

- Direct Human CLI save, same edit identity retry, concurrent-edit refusal and owner-supported restore, independently of the model.
- A natural Home request edits one selected active Bot's `MEMORY.md`, including exact target incarnation, original content, diff, branch and HEAD in a fresh Human review.
- Denial and approval of an obsolete review preserve canonical Memory. An Assignment remains read-only; only the eligible Tob Orchestrator writes.
- A separate natural request restores a selected historical commit through its own fresh Human review, retaining history and a recovery checkpoint.
- Canonical Git revision/content agree with the visible Memory file in Web and actual macOS Desktop; a second Bot remains unchanged.
- Soul/Core Memory changes reach new Sessions and the next compaction, while the running Session prefix stays frozen.

## How to get to it (user POV)

Bot mode → Home → ask Tob to update a named Bot's remembered preference → inspect the rendered
approval's target, previous text, exact diff and revision → Allow once → open that Bot's DM →
Memory files → `MEMORY.md`. The saved text and reported Git revision must agree with the Memory
owner. Deny a second edit, then confirm the file remains unchanged. Separately ask to restore the
original revision, review that restore and reopen the same file.

## Driving it with verify-app

`scripts/e2e-tob-memory-edit.mjs` attaches to an already built, isolated candidate Host; it never
launches, stops or restarts a Host or Desktop. Follow the normal isolated-profile and exclusive
macOS verification rules. A usable official model route and manual approval defaults are
preconditions. Never point this runner at the Human's existing Profile.

```bash
BH_E2E_INSTANCE=<private-instance.json> node scripts/e2e-tob-memory-edit.mjs direct
BH_E2E_INSTANCE=<private-instance.json> node scripts/e2e-tob-memory-edit.mjs journey
```

Use `BH_DESKTOP_CDP` and `BH_E2E_HUMAN_INSTANCE` for the candidate native macOS Desktop. Pass the
emitted `memory-edit-fixture.json` as `BH_E2E_MEMORY_EDIT_FIXTURE` to reuse only that runner's
disposable Bots. `BH_E2E_EVIDENCE` selects private evidence. Stages are `direct`, `edit`, `deny`,
`stale`, `restore` and `restart-read`; comma-separated stages run sequentially. `journey` runs the
four real Tob stages. `direct` is a separate Human CLI proof, not a Tob model journey. After
actually restarting the same candidate Profile externally, run `restart-read` with its retained
fixture. The runner records the source HEAD; retain build identity independently.

`capture` saves the exact canonical proposal inputs and the rendered settled status cards without
deciding pending operations. Settled cards do not expose their original input details. If a
pending-review screenshot is missing, use `review-capture` with the retained fixture: it creates
one additional proposal, captures its target and scrolled diff, denies it and verifies unchanged
Memory. It does not repeat the four completed journey stages.

The `stale` stage leaves an actual Tob approval pending, independently commits a different value
through Human CLI, then accepts the old review. Require the real native Shell result
`memory-conflict`, a completed Tob turn, handled Human delivery, real reply and unchanged
concurrent content. Every stage captures rendered review payloads, screenshots, ARIA snapshots,
fresh CLI call IDs, canonical reads and page errors. Restore saves graph and checkpoint reads.

Source regressions separately cover original-source revocation, target incarnation replacement,
archive/unavailability, same-HEAD dirty work, branch changes, mutable caller inputs, exact replay
payload, explicit Tob self edits, and fresh Human review even with full access/saved rules/automatic
approval. Scoped restore refuses dirty Memory and asks its owner to preserve unfinished work;
the direct Human owner retains its existing backup behavior. No reset/discard is used to make a
scoped review pass.

## Gotchas

- Source coverage and a prepared runner are not evidence of a passed direct CLI, real model, Web, macOS or Human check. Record each result at the exact head; preserve first failures.
- Approval denial or stale state must settle before a new Human request. Do not resubmit automatically or infer success from a model reply or pending card.
- A restore makes a new commit; its HEAD must differ from the historical SHA. Check graph ancestry and the owner's recovery checkpoint separately from screenshots.
- Save retry uses the original expected HEAD and exact ID/path/body, while the original commit remains current. Changed payload or later commits refuse rather than overwriting.
- The runner edits `MEMORY.md`; independent source cases cover `SOUL.md` through the same owner. A live Soul journey and a compaction/new-Session prefix read require their own evidence; file readback alone does not prove prompt adoption.
- Preserve the candidate's Profile/evidence for review and restore the Human's prior Desktop after the exclusive native window. Do not delete another task's Profile.
