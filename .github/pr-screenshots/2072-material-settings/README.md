# Android Material settings evidence

Source: 41637d6652dc28ab08452e1b2a11bb344bc97180. Base: 2bda25af3c1a2f2562990e6c3b110e0d8012ae5a.

All images are native Android captures from the assigned shared phone batch. Before source f1981551 has the same tree as the merged main base. Each pair matches theme, font scale, locale and QA data. The new native client adds Expo UI; pairing/history were retained. Build labels identify the installed client/QA manifest; JavaScript loaded through Metro matches the feature source.

Global settings images and six native switch targets use the final source. App icon pairs use the earlier presentation head c90361d1; the final change only alters read-only row and switch semantics and leaves those actionable icon rows unchanged.

The native XML check first failed with zero checkable switches. Final captures expose one labeled, enabled checked switch at 52×48dp in both themes and all three font scales. Native tap changed the designated QA Bot's local visibility preference, cold launch retained it and canonical local storage matched. The original shown state was restored. Analytics, permissions and push registration were not changed.

The original-speed clip is a spatial/temporal crop of a native recording. The slow clip replays the same frames at 0.5x. Neither is a performance benchmark. Full raw recordings, XML and private local state remain machine-local. No OCAT reference attachment or personal account content is published.

See provenance.json for the complete pairing and scope. Manual TalkBack, native iOS and Release/120FPS remain unqualified.
