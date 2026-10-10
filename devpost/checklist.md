---
doc: checklist
status: approved
---

# Build Checklist

Build mode: Fast

## Slices

- [x] **1. Reproduce the broken booking task end to end**
  Becomes usable: In Codespaces, a minimal dashboard can start the fixed `broken` scenario. A real Playwright mouse journey saves the reschedule date; a separate keyboard journey tries the primary Confirm Reschedule control with Enter and Space from clean equivalent states; the independent booking oracle reports the actual difference.
  Why now: This bootstraps the approved stack while proving the unique kernel immediately. It tests the real browser, scenario-only API boundary, worker isolation, and oracle before polishing the UI. If the Codespace cannot safely run the browser sandbox, stop and report the blocker rather than weakening it.
  PRD ref: `prd.md > The Core Journey`, `Dashboard and Scenario Selection`, `Browser Execution and Comparison`, `States and Boundaries`
  Spec ref: `spec.md > Stack`, `Where It Runs and How Someone Tries It`, `Fastify API`, `Run Coordinator`, `Internal Playwright Worker`, `Controlled Booking Fixture and State Oracle`
  Build: Bootstrap the React/Vite, TypeScript, Fastify, and Playwright project inside this slice. Add the minimal controlled booking fixture, fresh per-run state, internal worker, source-defined scenario-only schema, mouse/keyboard executions, and independent state oracle. Keep the first UI minimal but keyboard-operable; no AI or fabricated status path.
  Verify (mechanical): Run `npm test` and `npm run test:e2e`. Verify a real browser starts with sandbox enabled; mouse state changes to the expected date; Enter and Space keyboard states remain unchanged; oracle assertions match; unknown scenario IDs and extra request fields are rejected. Inspect the actual test output and traces.
  Learner check: In the Codespaces preview, start the broken scenario and confirm the mouse side shows the saved date while the keyboard side shows the independently observed unchanged date and failed action.
  Commit: `Add real broken booking comparison`

- [ ] **2. Pass fixed and alternative routes; replay the regression test**
  Becomes usable: The controlled demo proves all three approved scenarios. The fixed primary action succeeds by mouse, Enter, and Space. The alternative route uses Tab/Shift+Tab to reach `Enter new date`, types the expected strict `YYYY-MM-DD` date through real keyboard events, Tabs to `Save new date`, and activates it with Enter or Space. A generated standalone Playwright test is actually replayed: it fails on broken and passes on fixed.
  Why now: Completes the core booking proof, protects against false failures from a valid alternate route, and makes regression evidence repeatable before dashboard polish.
  PRD ref: `prd.md > Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`, `States and Boundaries`
  Spec ref: `spec.md > Controlled Booking Fixture and State Oracle`, `Scenario and Action Catalog`, `Evidence and Regression Replay`, `Data Model`
  Build: Add fixed and alternative fixture variants with independent reset states. Use only Tab, Shift+Tab, `keyboard.type`, Enter, and Space for keyboard journeys; no click, programmatic focus/fill, DOM mutation, or direct state write. Generate the regression test from the fixed template only after an independently confirmed failure, then execute it against the broken and fixed fixtures.
  Verify (mechanical): Run `npm test` and `npm run test:e2e`. Assert mouse and keyboard completion on fixed, oracle-confirmed completion and task-level Passed on alternative even though the primary control was not activated, and real generated-test replay failure on broken/pass on fixed. Confirm malformed dates do not change booking state.
  Learner check: Try all three scenarios in the preview. Confirm the alternative route reaches the same saved date without being reported as a task failure, and inspect the real regression replay results.
  Commit: `Add fixed alternative and replay scenarios`

- [ ] **3. Capture trustworthy evidence and handle run failures safely**
  Becomes usable: A run shows only real progress and one of Passed, Confirmed Failure, Inconclusive, or Test Error, with Test Incomplete and the actual reason when execution stops. Users can inspect authentic evidence, assertion details, retry from reset state, and download available evidence/report artifacts.
  Why now: Makes the core result auditable and prevents timeouts, missing evidence, or infrastructure errors from masquerading as defects before the full interface is polished.
  PRD ref: `prd.md > Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`, `States and Boundaries`
  Spec ref: `spec.md > Public Route Contract`, `Run Coordinator`, `Internal Playwright Worker`, `Evidence and Regression Replay`, `Important Failure Modes`
  Build: Add bounded run records, event streaming, timeouts, one-worker concurrency, request rate/body limits, artifact caps/retention, secret redaction, cleanup, retry reset, and report download. Keep the worker internal and pass only scenario/action IDs. Fail closed on unsafe execution.
  Verify (mechanical): Run API and browser tests for invalid/extra inputs, busy and rate-limited requests, browser timeout/error, unavailable oracle, evidence cleanup/redaction, expired runs, and successful retry. Confirm no error path emits Confirmed Failure without the independent assertion and valid mouse baseline.
  Learner check: Trigger or inspect a controlled incomplete/error outcome and verify its explanation, available evidence, assertion, retry behavior, and absence of a false defect verdict.
  Commit: `Add run evidence and safe failure handling`

- [ ] **4. Complete the accessible responsive SwitchPath dashboard**
  Becomes usable: The polished dashboard presents the approved headline and Start Accessibility Test action, all three scenarios, mouse/keyboard comparison, timeline, accessible outcome states, evidence, retry, and regression replay in the approved premium responsive visual direction.
  Why now: The end-to-end kernel and failure semantics already work, so visual work is driven by genuine data and cannot hide missing execution behind mock UI.
  PRD ref: `prd.md > Screens and Layout`, `Look and Feel`, `Dashboard and Scenario Selection`, `Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`
  Spec ref: `spec.md > Look and Feel`, `React Dashboard`, `Fastify API`
  Build: Implement the responsive React dashboard with restrained CSS, side-by-side results, timeline, semantic controls, text/icon status labels, visible focus, reduced-motion support, authentic progress, and real evidence/report downloads. Do not introduce placeholder result labels or fake controls.
  Verify (mechanical): Run `npm test`, `npm run test:e2e`, and the documented accessibility checks. Test keyboard-only operation and responsive layouts; confirm every visible control has a working action and statuses are understandable without color.
  Learner check: At the fast-mode checkpoint, open the running dashboard, complete a broken and successful route, inspect evidence/replay, and give feedback on clarity and visual hierarchy.
  Commit: `Build responsive evidence dashboard`

- [ ] **5. Add optional hosted AI and evaluate deployment gates**
  Becomes usable: The app stays fully functional with deterministic action plans and no API key. If NVIDIA Build access is independently confirmed as authorized and no-cost, the replaceable server-side adapter may propose validated action IDs or explain sanitized evidence; it never decides outcomes. A public URL is enabled only if every host sandbox, resource, browser, and cost gate passes.
  Why now: AI and public hosting are optional dependencies. The verified local kernel, tests, and fallback exist first, so missing credits or unsafe hosting cannot block the working POC.
  PRD ref: `prd.md > Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`, `States and Boundaries`
  Spec ref: `spec.md > AI Provider Adapter`, `External Services and Dependencies`, `Public Hosting Gate`, `Decisions and Open Issues`
  Build: Implement the provider-neutral adapter with server-only environment configuration, strict output schema, timeout, usage cap, and deterministic fallback. Do not access credentials or call NVIDIA unless authorized free access is confirmed. Test the deployment sandbox and actual browser/resource requirements; do not create paid services or publish if a gate fails.
  Verify (mechanical): Run adapter/schema tests with provider disabled and invalid/timeout responses; verify all three scenarios still pass using deterministic plans. Only if authorized access exists, verify a real provider call without exposing its key. For hosting, record measured sandbox/resource/cost evidence; otherwise mark deployment deferred and retain the Codespaces demo path.
  Learner check: Review that the application works with the provider disabled and that the deployment decision reflects measured security, resource, browser, and cost evidence—not assumptions.
  Commit: `Add optional provider and deployment gate`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after Slice 2, review the complete three-scenario proof and regression replay before the dashboard polish slice.
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [what actually happened; real document/test/code references; unfinished work if interrupted]
Route and stops: [actual paths and symbols; guided stops completed, or reference-only route]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: Fast

## Revisions
