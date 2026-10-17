# ADR-0230: Home rolling usage extends retained anonymous receipts

- Status: Accepted for #2081
- Date: 2026-10-18
- Issue: [#2081](https://github.com/BotHarness/DeepSeekBot/issues/2081)
- Amends: [ADR-0094](0094-retain-per-model-usage-after-session-deletion.md)

Home needs an exact preceding 24-hour interval, while existing Usage statistics use Host-local
calendar days. The pinned DSH Session Query `readSession` and `readEvent` both load a complete
logical log before returning their result; event search pages contain metadata rather than token
payloads. A Session-count or returned-event limit therefore cannot bound cold-log memory or IO.

Generation 102 extends the existing Usage owner's HMAC receipt with `occurred_at_ms` and a
nullable reported `total_tokens`, indexed by occurrence time. It adds a coverage-start boundary
to the existing receipt state. The same transaction admits trusted owned SessionEvents, writes
one receipt and increments the retained daily counters. Existing receipt replay may fill absent
metadata only from actual canonical evidence, without incrementing those counters again.
No prompt, response, model payload, native Session ID or transferable authority is retained.
This deliberately adds per-attempt time and total metadata to the retained statistic described in
ADR-0094; it does not create another owner or copy Session history.

Home queries this projection using a half-open UTC timestamp interval `[from, to)`, defaulting to
24 hours with 7- and 30-day choices. At most 50,001 scalar receipt rows are read (50,000 plus a
truncation sentinel); larger intervals report a lower bound and `partial`. The query never invokes
Session Query, a model, or a background reconstruction. Existing Host startup reconciliation
continues independently; its behavior is not a guarantee about Home reads or proof that old
histories remain available. Metadata enrichment piggybacks that existing owner workflow only.

An upgraded Profile with historical daily statistics, receipts or owned Sessions starts with an explicit coverage
boundary. Adding nullable fields does not establish precise historical coverage. Partial trusted
replay can supply a numeric lower bound, while absent histories and legacy baselines remain
partial or unknown. New reported unknown totals stay null; reconciliation/degraded quality is
independent of whether a numeric lower bound exists. Zero is complete only for a covered empty
range. Statistics survive ordinary history loss and restart; the existing explicit Bot usage purge
removes receipts and counters together and retires roots against late replay.

A separate timestamp store would duplicate Usage lifecycle and purge semantics. Relabeling a
calendar bucket as rolling 24 hours would misstate the interval. Cold scans would put large raw
histories on the Home critical path. Extending the retained receipt trades an additive migration
and small per-attempt metadata growth for an indexed, bounded query with truthful upgrade limits.
