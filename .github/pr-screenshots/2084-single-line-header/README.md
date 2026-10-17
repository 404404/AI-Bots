# Chats large-text alignment

Source6556f2312513efb78bcfbc69591d73bc5d45b09a; main base288238e51e9b9191b4c8b7f9076100cf273bba19; assigned-QA integration a871e0f752c2c169c98454bfe2295633b8a4a481.

Six matched light/dark×font1/1.3/2 pairs cover the header, and six further pairs cover conversation rows. Header images crop1220×520 at0,130. Row images crop1220×1100 at0,430. All are unscaled spatial crops of real1220×2712 Android captures; full PNG/XML stay private. Only seeded QA data is shown. No Human reference attachment is republished.

Header baseline files match main. At maximum font, Settings is54dp below the Host target before; after, centers align at0dp and both targets meet48dp. Long names tail-truncate visually; AX retains the complete Host name. Other HostChipFace uses retain their wrapping behavior.

Row Before isolates the old row layout after the header fix at8d6ab4832; ConversationRow itself still matches main. One pending QA Bot DM has title/time centers39.08dp apart before and0dp after at maximum text. Title and timestamp share one line; preview/count share the second. Groups without a timestamp no longer retain an empty metadata line. All12 after row cases (two rows×six theme/font combinations) pass native bounds checks.

At maximum text, Host drawer/Settings activation pass at the unchanged header implementation8d6ab4832. Bot DM and group activation and return pass at current source. No message was sent and no pending question resolved. Original font/theme were restored, with phone left in Chats. Native iOS and manual TalkBack remain unqualified.

Types,20 focused tests,lint,format,changelog and all required exact-head CI checks pass. No native-input or Host API changes. Assigned QA retains accepted Material/count changes from2073/2078, and all three fix files exactly match current source. The isolated Host remains the previously paired QA Host.
