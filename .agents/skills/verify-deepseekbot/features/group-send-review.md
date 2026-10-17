# Group send review after a Human correction

An opt-in local Group holds a Bot reply when formal conversation content changed after its
observed basis. The Human sees only committed replies in canonical history.

## Sub-features

- Observe: full inbound content or bounded `channel_read` supplies a Host-issued basis.
- Hold: changed content returns `held`, clears the preview and creates no formal message.
- Recheck: explicit `draft_id` and `observation_id` allow one revision or unchanged recheck.
- Drop: `drop: true` abandons the draft independently of Inbox resolution.
- Refuse: revoked membership, purged source, expired draft or restarted Host cannot auto-send.
- Review: the pilot retains complete paired histories and separate runtime/judge usage.

## How to get to it (user POV)

Create a local Group with two Bots and mentions-only wake settings. Enable it with
`deepseekbot group-send-review <channel> --accept`. Mention one Bot with a request; correct
the request while its preview is visible. The final reply should account for the correction.
Use `--off` to stop the opt-in. Existing wake defaults remain unchanged.

## Driving it with verify-app

Launch and doctor two isolated instances: frozen baseline #2053 B0 and the candidate.
`node scripts/e2e-group-send-review.mjs --baseline-instance <json> --candidate-instance <json>
--report <json>` runs a diagnostic pair using `DEEPSEEK_API_KEY` and the fixed direct model.
`--formal` runs exactly four families of ten pairs; it must use committed candidate bytes.
Do not count diagnostics or missed race windows as valid pilot successes.

Open the resulting Group in the Web Client and capture the original request, correction and
final answer with `verify-app shot`; inspect console output. Compare `channelMessages` with
the draft frames and `botToolTrace`: a held draft must have no canonical placement.
Use `bot-tool <bot> channel_read --args-stdin`, then `channel_send` with the returned
`observationIds[channel]`; append a Human correction between those CLI calls to deterministically
exercise the same production guard without the model. Read again before rechecking.

## Gotchas

- A successful tool call returning `held` is not delivery. Missing usage remains unknown.
- Draft previews are public temporary content; they are retained separately in reports.
- Tool handles cannot cross owners or Groups. Source purge removes derived draft bodies.
- After one failed recheck, automatic retries stop. This slice does not implement #2054–2056.
- Human acceptance requires independent review of full histories; no test or LLM signs it.
