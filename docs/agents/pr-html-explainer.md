# PR HTML explainers

Every PR assesses whether a detailed HTML explanation would help a reviewer. Use
`answer-me-with-html` for nontrivial behavior, lifecycle, permission, persistence, or cross-module
changes. A typo, dependency-only refresh, simple styling edit, or short linear change may omit the
page when the PR body explains it sufficiently. A Human request for an explainer takes precedence.

## Roles

| Artifact                                  | Responsibility                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `visual-pr`                               | Required PR body: one-sentence why, compact change outline, and review warnings.        |
| `answer-me-with-html`                     | Detailed behavior, implementation, design trade-offs, and verification explanation.     |
| `pr-lens`                                 | Optional focused architecture or data-flow diagram when boundaries are hard to explain. |
| Screenshots, recordings, and test results | Evidence of the actual behavior and the specific checks performed.                      |

An explainer is a review aid, not a product specification, persistence authority, test result, or
Human approval. Preserve the existing PR body template, merge-risk classification, UI evidence
requirements, and pause for Human QA. Do not enable the upstream skill's always-on mode as part of
PR work. Do not modify installed third-party skills to implement repository policy.

## Workflow

1. Read the complete PR diff against its merge base and the relevant issue. Decide whether the
   behavior needs an explainer. When omitting a page for a nontrivial change, briefly explain why
   in the review handoff; do not add a mandatory section to the `visual-pr` template.
2. Read `.agents/skills/answer-me-with-html/SKILL.md`. Use the repository-local CLI rather than a
   machine-specific global path. Save the Markdown draft and HTML under the ignored
   `.humanlayer/tasks/<task>/` directory. Follow the Human's language preference.
3. Bind the page to the PR number, exact base and head SHAs, and generation date. Read code from
   the exact head, not unrelated dirty working-tree edits. Ground diagrams and claims in the diff,
   existing code, or verified runtime contracts. Mark proposed behavior and illustrative examples
   explicitly; never invent measurements or successful checks.
4. Write only the panels needed to explain this change, normally four to six:
   - Observable behavior before and after, including deliberate omissions.
   - The implementation path and owning modules or authority boundaries.
   - Short decisive code excerpts or diff hunks, linked to exact-head code on GitHub.
   - Design trade-offs, compatibility, and failure or refusal paths.
   - Verification performed, unresolved risks, and the next Human-QA action.
5. Render the Markdown with the bundled CLI; do not hand-write the page layout:

   ```bash
   node .agents/skills/answer-me-with-html/scripts/am.mjs render \
     .humanlayer/tasks/<task>/pr-explainer.md \
     -o .humanlayer/tasks/<task>/pr-explainer.html --no-open
   ```

6. Inspect the render output and fix syntax or code warnings. Review the page in a browser at
   desktop and narrow widths when browser access is available. Check diagram semantics, code
   provenance, readability, and links. Report any blocked visual check rather than claiming it
   passed. Do not start `am serve`, change global settings, or publish to a hosting service merely
   to make a page accessible.
7. Keep focused tests, full suite, CI, native E2E, visual inspection, Human QA, merge, and deployment
   as separate statuses, with evidence links where available. Images must come from real captures;
   a diagram or synthetic example is not a screenshot of implemented behavior.
8. Before sharing, inspect the complete HTML, including its hidden draft, embedded code and images,
   and metadata. Remove secrets, private chats, credentials, local login URLs, private Profile or
   database data, and unrelated conversations. Follow the existing authorized audience; never
   upload private code to a public host as an implicit part of generating an explainer.
9. Keep the PR body concise. Put the accessible explainer link in a separate PR comment, alongside
   the head SHA and verification limits. Use an already authorized publishing or attachment path
   and verify the reviewer can open it. A local file, `file://` URL, or localhost URL is only a local
   handoff, not a shared review artifact. If no suitable sharing path exists, report the local
   artifact and the accessibility gap; do not claim delivery to reviewers is complete.
10. Refresh or explicitly mark the explainer stale when the PR head changes. Recheck its claims,
    links, and audience before replacing a shared artifact. Do not leave an older page presented
    as an explanation of the current head.

## Installation and provenance

The repository installation lives under `.agents/skills/answer-me-with-html/`, with a Claude Code
symlink under `.claude/skills/` and source/hash recorded in `skills-lock.json`. The initial import
uses upstream revision `533c39fd47d814a6bee3d9c1df388345f4e4c858` from
`QingYunA/answer-me-with-html`. Keep installed files unchanged; updates are a separate reviewed
dependency change. A global installation is optional and does not replace the repository copy.

Use `node .agents/skills/answer-me-with-html/scripts/am.mjs --help` to check the local installation.
Page generation does not authorize publishing, broaden sharing, or install a video/voice service.
