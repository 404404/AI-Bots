# ADR-0231: Tob Assignments read selected Memory through a scoped CLI

- Status: Accepted for the read-only slice in #2091
- Date: 2026-10-18
- Issue: [#2091](https://github.com/BotHarness/DeepSeekBot/issues/2091)

An application-defined Tob Assignment remains a Tob-owned independent root DSH Session. Reading
another Bot's Memory does not transfer Session Ownership, create another manager identity, or
change the inspected Bot's Orchestrator. Its single working directory comes from an active
Tob-owned Workspace Grant. A grant spanning the Bot data root or a Memory Repository is refused.

Tob creates this Assignment through `assignment-memory-create` in the existing invocation-scoped
native Shell CLI. The Host requires the protected Tob root Orchestrator and one accepted canonical
Human private-DM Source Event. Creation snapshots selected Bot incarnations before Human review, rechecks them at creation, and uses existing review policy plus a stable operation key.
The same key, payload and original source return the canonical Assignment receipt after a lost
response; changed inputs refuse. Creating against an occupied Continuity Key refuses: continue
the existing Session through its normal Assignment Request instead.

The operational database stores a delegated read scope beside the Assignment: original source,
selected stable Bot IDs and incarnation timestamps, operation receipt and explicit revocation.
This is an authorization record, not a second Assignment lifecycle or Memory store. It does not
contain credentials. The Assignment uses `workspace-write` and `ask` even if Tob's preset allows
full access. Native reporting, pending acceptance, continuation, stopping and archiving retain
their existing owners.

Its native Shell is a restricted CLI Consumer: it accepts one literal `deepseekbot` invocation, invokes the shipped CLI in-process with only its broker context, and never starts an OS Shell. Operators, substitutions, redirects, environment assignments and alternate executables refuse. Native file tools, Subagents and other execution tools are unavailable in this Assignment. Each call gets a fresh invocation lease from the same broker used by Tob. That broker
admits only `memory-snapshot`, `memory-file`, `memory-history` and `memory-diff`. It removes
administrative Host credentials and refuses management commands and writes. Each request checks
original Human provenance and source availability, Tob ownership, Assignment lifetime/archive,
revocation, active matching Workspace Grant, target selection and current Bot incarnation and
archive/deletion state. A resumed Session retains this scope; it cannot add targets.

Memory owns immutable Git revision queries shared by the Human online CLI and delegated CLI.
Snapshot lists paths and a full SHA; subsequent file/history/diff pages require that explicit
reachable revision. Results include source Bot, path where relevant, revision status
(`accepted`, `pending` or `needs-repair`), bounded content, `partial`, `nextOffset` and unavailable
or binary state. Pending Git revisions are reported truthfully rather than promoted to accepted
Memory. File text is read from Git, so later working-tree edits cannot change a pinned page.

Retrieved Memory, quotes and Assignment instructions are data, never authority to broaden the
scope. The Assignment reports source-grounded comparisons through the normal Assignment Report
path; Tob replies in its existing private DM. No automatic full-history copy into Tob Memory is
introduced. Cross-Bot mutation remains outside this decision. Source tests, live CLI, real model
execution, Web views, macOS Desktop and Human QA remain independent evidence gates.

The alternative of passing a general Host token to a Shell would let imported instructions call
unrelated management operations. A broad data-directory grant would bypass repository owners.
Reassigning the Session to each inspected Bot would also misattribute reporting and continuation.
The narrow durable scope keeps those boundaries explicit, at the cost of a forward schema
migration and deliberate refusal when the original authority is unavailable.
