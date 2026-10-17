# Android navigation island — Human feedback

Current source 75175fcb348aeafddbf8eacb1026aa392074eef4; parent/base 41637d6652dc28ab08452e1b2a11bb344bc97180; shared-QA integration 0a7e11859f5b4b01fbc0942be6539945d8a586aa. PR2078 remains stacked on2073; neither is merged.

Twelve before/after pairs cover both destinations, light/dark and font1/1.3/2. The main Before images use the original parent; After images use current source. The extra centering pair compares previous iteration e6e42ebc with the current centered40dp highlight. Main images are unscaled1220x512 crops; centering details are704x312 crops.

centering-check.json records the native red/green symptom check: upper offset6.46dp/highlight56dp before;2.46dp after a center-only probe;1.54dp/40dp on both current tabs. Native selection, enabled state,48dp targets, label bounds and island centering pass in all12 cases.

centering-original.mp4 and centering-half-speed.mp4 show current-source tab presses with original variable timestamps and identical frames at0.5x. Only a reviewed own-app prefix is published. The current-source long-scroll check was completed after the Human returned to the app; centering-scroll-original.mp4 separately shows hide/reveal. navigation-original.mp4 and navigation-half-speed.mp4 remain the explicitly older e6e42ebc scroll-hide evidence. No120FPS claim.

Native inputs/client are unchanged. The build label remains d1570a92a-dirty; Metro JavaScript matches the source above. Original phone font/theme were restored. Human reverse-back, manual TalkBack, iOS runtime and Release120FPS remain unqualified. No reference attachment is published.
