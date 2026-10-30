This directory adds an isolated browser-worker prototype.

- `playwright-core` is distributed under Apache License 2.0; its upstream source and license are not vendored here.
- Chromium is installed from Debian's Chromium package repository during image build. Debian package and Chromium licensing notices remain applicable in the resulting image.
- `deploy/chromium-userns-seccomp.json` is copied byte-for-byte from the repository's approved profile. Its SHA-256 is `a8ec691e2b21a15ccc4ab1d1af7284f900a334887936403ff3b4b51beead1ee4`.
- No GUI/DSH source or image layer is reused.
