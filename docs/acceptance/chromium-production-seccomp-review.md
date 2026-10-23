# Chromium production seccomp change review

## Current state

The checked-in production profile remains unchanged. Production Chromium still exits before DevTools because `chroot` returns `EPERM`; the most recent trace records `chroot:EPERM` before `SIGTRAP`. The CI-only diagnostic profile passed the same GUI checks after adding the two syscall rules below. That diagnostic result is evidence for the candidate, not approval to apply it to production.

## Proposed delta

Keep Docker's default-deny `SCMP_ACT_ERRNO` policy and the existing capability drop. Add only:

1. An unconditional seccomp allow for the `chroot` syscall, required by Chromium's namespace sandbox setup.
2. A `clone` allow rule whose namespace-flag mask equals `CLONE_NEWPID` (`0x20000000`) and no other namespace flag. The mask is `0x7e020080`; the seccomp comparator is `SCMP_CMP_MASKED_EQ`. Use argument index 0 except on s390/s390x, where `clone` uses argument index 1.

The rule does not add `CAP_SYS_ADMIN`, `CAP_SYS_CHROOT`, or any other container capability. It does allow these syscalls to be attempted by any process in the container, because seccomp cannot scope a rule to Chromium alone. The kernel still enforces the caller's namespace and capability constraints. The existing `no-new-privileges`, capability drop, and Docker default-deny behavior stay in place.

## Evidence

Run [39879550251](https://github.com/404404/AI-Bots/actions/runs/39879550251), commit `08e8fcd4217faa55036fc266924b84fb1cfb6fb5`, used a non-publishing CI-only profile with these exact additions. The production profile failed at `chroot:EPERM`. The diagnostic profile then passed:

- `chrome://sandbox`: Namespace Sandbox and Seccomp-BPF both reported `yes`.
- Browser and Computer shared the visible Chromium display; Computer click and text entry were observed by Browser, and a desktop screenshot returned.
- CDP reported 3 renderer processes; all 3 matched `/proc` and all 3 had Seccomp filtering. No renderer was unfiltered and no process IDs were written to the report.
- Container capabilities remained dropped and Chromium did not use `--no-sandbox`.

The CI run passed image build and Trivy but failed the production-profile acceptance gate. No image was published or deployed.

## Decision required

The automatic approval review rejected the persistent production-profile edit because it changes the container security boundary and the request had not explicitly authorized these specific exceptions. The proposed delta is therefore not applied. After explicit approval, implementation must rerun the full production-profile GUI gate; publication and deployment remain gated on that run passing.
