# Standalone Bot avatars

This module is the storage and image-validation layer for custom Bot avatars. It is not an HTTP, CLI, or UI feature by itself; those surfaces must call the same `AvatarStore` after authenticating the owner and resolving the Bot through trusted application context.

## Image contract

- Input is canonical standard Base64 containing a PNG file. Whitespace, data URLs, extensions, and caller-supplied MIME types are not accepted as evidence of format.
- Input PNG bytes are limited to 2 MiB (inclusive). Width and height are each at most 1024 and total pixels are at most 1,048,576.
- Supported pixels are 8-bit truecolor RGB (PNG color type 2) and truecolor with alpha RGBA (color type 6), non-interlaced. Palette/grayscale/16-bit/animated PNGs, SVG, HTML, and other encodings are rejected.
- PNG signature, chunk bounds, CRCs, chunk ordering, single IHDR, IDAT stream, and terminal IEND are validated. Unknown critical chunks, APNG chunks, and `tRNS` are rejected. Optional ancillary metadata and a valid optional PLTE are discarded.
- Inflate output is capped at the exact IHDR-derived scanline length and must match that length. PNG filters 0–4 are reconstructed before conversion.
- Images are reduced with nearest-neighbor sampling so the longest output edge is at most 256 pixels. Output is freshly encoded as PNG with only IHDR, IDAT, and IEND, preserving RGB or RGBA, and is capped at 320 KiB.

Supported input PNGs have their metadata and ancillary chunks removed. This output is a passive raster PNG; it does not retain file names, profiles, text chunks, animation, or original compressed bytes.

## Store contract

`AvatarStore` accepts a narrow storage shape (`db.prepare()` and `transaction()`) and uses one SQLite BLOB row per Bot. The exported `avatarSchemaSql` is migration material for the next standalone schema version; it is intentionally not applied by this module. The table's foreign key cascades with Bot deletion, and no host filesystem path or separately referenced file is stored.

- `getMetadata(botId)` returns metadata or `null`; `read(botId)` returns metadata plus the normalized PNG as Base64 or `null`.
- `set(botId, pngBase64, expectedRevision?)` validates and normalizes before acquiring the write transaction, then atomically inserts/replaces the row. Revision is SHA-256 of the normalized PNG. When supplied, an expected revision must match; explicit `null` means the caller expects no existing avatar.
- `delete(botId, expectedRevision?)` is transactional and supports the same compare-and-set behavior. Deleting one Bot cannot affect another Bot's row.
- All operations verify that the Bot exists. The caller must perform authorization first: this low-level module does not accept model/tool arguments as proof of owner identity and does not implement session checks.

Stable refusal codes include `invalid-avatar-base64`, `invalid-avatar-format`, `invalid-avatar-image`, `unsupported-avatar-png`, `avatar-input-too-large`, `avatar-dimensions-too-large`, `avatar-output-too-large`, `invalid-avatar-revision`, `avatar-revision-conflict`, and `not-found`.
