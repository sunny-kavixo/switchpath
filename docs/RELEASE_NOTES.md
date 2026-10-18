# Release candidate

Unpublished local release, prepared October 18, 2026. Base commit: 99d8cd6.

Existing verified changes reserve worker admission before asynchronous setup, protect asynchronous result finalization, remove duplicate regression-artifact entries, separate standalone replay from development-server startup, and serialize E2E execution. Dashboard changes improve anchor navigation, download names, group semantics, foreground color and narrow layouts. Backend concurrency and dashboard regressions accompany those changes.

This publication pass changes documentation and screenshot organization only. It adds an illustrated walkthrough, architecture notes and historical verification records. No application behavior was changed or new suite result claimed.

Known limits: controlled fixtures only; Chromium only; temporary evidence; no public hosting, runtime AI or full accessibility certification. See [testing](TESTING.md).
