# Android navigation island and Activity count

Current source3cd35d2381265d2203882a4a2c251f914aaca312; base41637d6652dc28ab08452e1b2a11bb344bc97180; QA a8220ab5495bebdd7b4f9a961740eb9ca3c3c1f3. PR2078 is stacked on2073; both remain draft/unmerged.

Twelve native navigation pairs cover Chats/Activity × light/dark × font1/1.3/2. Original parent screenshots are Before; current captures are After. Main crops are1220×512 at y2200; latest-feedback details are704×312 at258,2400 and compare75175 against current. Current native selected/enabled state,48dp targets, label bounds and centering pass. Visible-content offset remains-1.54dp and selected highlight40dp on both tabs.

Six settings cases verify every option's native checked/enabled state and reachability in the same theme/font combinations. The baseline Settings entry screenshot is parent41637d665, source-matched to the earlier OCAT final matrix. The new subpage has no prior counterpart. A real pending question gives default approvals-only count0/icon; selecting approvals+questions gives1. Multi-selection persists across cold launches; defaults and original system font/theme were restored afterward.99+ is covered by count saturation/format tests, not a native100-item fixture.

count-morph-original.mp4 is a reviewed704×312 own-app spatial crop:12.9s,423 VFR frames. count-morph-half-speed.mp4 replays the same423frames at0.5x (25.7s). Six tab presses show digits swapping with the bell. Original timestamps are preserved. No120FPS claim.

Earlier centering-original/half-speed/scroll recordings remain75175 evidence, and navigation-original/half-speed remain e6e42ebc evidence; they are not recordings of this head. centering-check.json preserves the earlier red/green native alignment diagnosis. Current measurements and exact qualifications are in provenance.json. Source tests549 passed/8 skipped and exact-head CI checks pass.

Native inputs and the installed SDK58 client were unchanged. Generated build labels can name an earlier QA manifest; Metro app/src exactly matches the source above. iOS native, manual TalkBack, native99+, Release120FPS and predictive previous-page preview remain unqualified. No reference attachment, credential, raw XML or unrelated application content is published.
