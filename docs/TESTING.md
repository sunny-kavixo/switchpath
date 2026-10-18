# Verification and reproduction

## Recorded results

The completed October 12 Mac run reported build PASS, 12 backend tests PASS and 5 Chromium E2E tests PASS (20.8 seconds). The stored manifest identifies the dirty working-tree source, not just commit 99d8cd6. Publication preparation checked the source hashes against this evidence; no fresh suite run is claimed.

[Raw logs](evidence/verification-logs.txt) · [Source hashes and environment](evidence/verification-manifest.json)

Broken/fixed regression replay produced expected exit codes 1/0. Three scenario runs verify saved dates; dashboard tests cover keyboard navigation, narrow reflow and network error presentation. The concurrent-start regression expects one accepted start and two busy responses.

## Run checks

Use the [README setup](../README.md#run-locally), including browser and temporary-directory exports. Keep ports 3000 and 5173 free for E2E:

```sh
npm test
npm run build
npm run test:e2e
```

E2E starts its development servers. One worker matches the API's single active browser-run capacity. Standalone replay mode skips development-server startup.

## Accessibility limits

Five recorded axe scans reported zero detected violations. Gradient contrast evaluation was incomplete. Screen-reader validation, comprehensive manual contrast review and other browser engines remain unverified. Responsive screenshots illustrate layout, not assistive-technology compatibility. No accessibility certification is claimed.
