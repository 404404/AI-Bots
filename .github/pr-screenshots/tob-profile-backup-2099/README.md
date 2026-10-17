# Profile backup CLI evidence

Product source: `20126473bd69c5404c720a19874f40b173817f3e` on PR2119 base `a3e2c4e64d131191e686e33cb207d3db9b3a0937`. These are real synthetic isolated Web captures,1440×1000,dark,Chinese locale. This commit adds evidence only.

- review-before / receipt-after: actual one-use scoped Tob export review, followed by known-plan reconciliation after deliberately discarding export stdout. Same completed identity; no second approval/archive. This is a workflow-state pair, not a version comparison or packet-loss proof. The base has no matching scoped CLI operation, and Client UI code is unchanged.
- recovery-before / recovery-after: the same new restored Profile before model authorization and after explicit activation of exactly one ordinary Bot. Other imported identity remains cold. Source Host stayed stopped. The identical canonical-home restart preserves complete recovery readback.
- Actual copied source Device credential is refused401 by the restored gateway; target operator and explicit new target pairing work. Original source pairing stays unrevoked.
- Actual SIGKILL of only the spawned export/restore child leaves private stages and no final destination/completion receipt. Archive hashes and canonical Source/native Session correlations remain private; no credentials, backup content, Session dump or login URL are published.

Native macOS, Human QA, CI and final combined-stack qualification are separate pending gates. Explainer is a self-contained downloadable HTML file, not a hosted preview or runtime evidence. Earlier driver failures remain private and explicitly reported; no model operation was repeated merely to obtain a prettier screenshot.
