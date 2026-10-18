---
doc: spec
status: approved
---

# SwitchPath — Technical Spec

## How This Works, In Plain Language

The dashboard is a React page. Its only public test-start request names one of three built-in booking scenarios. Fastify is the guarded front desk: its fixed JSON Schemas reject extra fields and unknown scenario names before any browser starts.

A run coordinator checks limits and starts an internal Playwright worker as a separate process. The worker does not receive the hosted-AI credential. It creates a temporary copy of the controlled booking demo, opens it in a real Playwright browser, runs the mouse baseline and keyboard route from separate clean states, and checks the booking state directly in the demo's server-side test fixture. That check does not read a status label from the dashboard.

The worker sends structured progress and results back to Fastify. The dashboard receives live updates through Server-Sent Events, a one-way stream from server to browser. Screenshots, traces, and logs are real files from that run, temporarily stored and cleaned up; results are never invented or reused from a previous run.

If NVIDIA Build access is available and authorized at no cost, only the Fastify service calls it through a replaceable provider adapter. AI may propose a restricted sequence of predefined keyboard actions or explain sanitized evidence. The worker accepts only validated action identifiers. The deterministic, non-AI plans for all three scenarios work without NVIDIA, and only Playwright plus the independent booking-state assertion can determine an outcome.

Development and first verification happen in the existing Codespace. Render is only a candidate for the public deployment: it is not safe or suitable until its actual Playwright sandbox, memory, browser compatibility, request isolation, and no-cost behavior are verified. If any hard gate fails, do not publish a URL or weaken the sandbox; use the Codespaces demo, public repository, and video. No paid resources are authorized.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`, `Dashboard and Scenario Selection`, `Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`.

1. The React dashboard displays the fixed booking demo, its mouse baseline, expected booking result, and the three predefined scenarios.
2. The browser sends `POST /api/runs` with only a `scenarioId`. Fastify checks a source-controlled JSON Schema with `additionalProperties: false`, validates the scenario enum, applies request limits, and rejects all unrecognized inputs. No public route accepts a URL, selector, script, or command.
3. The coordinator checks the global concurrency limit and starts a fixed worker entry point without a shell. It passes only the selected scenario and a validated list of allowed action IDs; it passes no API key, user-supplied executable content, or arbitrary navigation target.
4. The worker creates a fresh temporary booking fixture and a local-only demo server for this run. It executes the mouse baseline and keyboard scenario in separate browser contexts and separately reset booking states. The keyboard actions are Playwright keyboard actions only; they do not click or mutate the DOM to complete the task.
5. The worker reads the booking fixture's server-side state as the independent oracle, compares it with the expected result and successful mouse baseline, and reports structured evidence. UI text and AI output are not inputs to the oracle.
6. If an AI plan is enabled, the Fastify service obtains it before dispatch, validates its schema and scenario-specific action allowlist, and forwards only the accepted action IDs. An unavailable, timed-out, rate-limited, or invalid AI response selects the deterministic plan instead.
7. The dashboard receives actual progress events and shows the mouse/keyboard comparison, task assertion, and the appropriate Passed, Confirmed Failure, Inconclusive, or Test Error result. An interrupted run says Test Incomplete with its actual reason.
8. For a Confirmed Failure only, the worker creates a standalone regression test from a fixed source template, then actually replays it against the broken and fixed demo variants. The UI reports each real replay result. Evidence and run state are removed after their configured short retention period.

## Stack

| Area | Choice | Why and tradeoff |
|---|---|---|
| Runtime | Supported Node.js LTS, pinned in `.nvmrc` and `package.json` | One TypeScript runtime for API, worker, and Playwright. Confirm the selected LTS against the pinned Playwright release in Codespaces. |
| Frontend | React + TypeScript + Vite | The learner's preferred stack; a responsive, purpose-built dashboard without a full-stack framework. Vite's development server is separate from the production Fastify server. |
| Styling | CSS custom properties and small component styles | Keeps the visual identity and accessible focus/reduced-motion behavior under direct control without a large component or animation dependency. |
| API | Fastify 5 + TypeScript + source-controlled JSON Schema | Learner-approved. Fastify recommends JSON Schema for route validation and response serialization. Schemas are application code, never user input. |
| Rate limiting | `@fastify/rate-limit` plus a one-run coordinator limit | Rejects abuse before runner launch; limits are bounded per source and globally. Configure trusted proxy handling explicitly at the host. |
| Browser | `@playwright/test` for Node.js with its matching pinned Chromium release | One Playwright version drives real browser execution and the generated regression replay. Package and browser-image versions must match exactly. |
| AI | Replaceable NVIDIA Build adapter, optional at runtime | Preferred only if free access is authorized and a compatible model/API contract is verified. All AI results pass a fixed action schema; the deterministic plans remain complete. |
| State | Per-run in-memory fixture and OS temporary directory for evidence | No production database. Runs are isolated and ephemeral; process restart loses current runs and evidence rather than showing stale results. |
| Tests | Node's built-in test runner for API/schema/oracle unit checks; Playwright Test for browser scenarios and regression replay | Avoids a second unit-test framework while keeping the required browser test genuine and executable. |

### Alternatives Considered

- **Express instead of Fastify:** Express has a larger, familiar ecosystem, but would need a separate validation layer for the strict scenario-only API. Fastify's source-defined JSON Schema validation better matches the public input boundary.
- **Next.js instead of Vite + Fastify:** Next.js combines frontend and server conventions, but this project needs an explicitly isolated internal runner boundary and the learner selected a separate lightweight API. Adding a full-stack framework would not simplify that boundary.
- **Python/FastAPI:** Python aligns with the learner's existing experience, but React plus a Python API/runner would split the approved TypeScript-first architecture and add cross-language integration.
- **A production database:** not justified for ephemeral demo bookings, runs, or evidence; it adds persistence and security obligations without proving the core idea.
- **A large UI or animation framework:** not needed for one dashboard and would add dependencies without improving the comparison evidence.

Pin compatible package versions in the lockfile and pin the Playwright container/browser to the same Playwright release. Select the exact current Node LTS and compatible stable package patches when scaffolding; do not use floating production versions. The official Playwright Docker documentation currently gives `1.64.0` as an image example, not as a guarantee that this is the selected release.

## Where It Runs and How Someone Tries It

### Codespaces Development

The repository remains the source of truth. Once implementation is approved, the README will provide these reproducible Codespaces steps, adjusted only if the tested package scripts require it:

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open `http://localhost:5173` in the Codespaces forwarded-port preview. Vite serves the React dashboard and proxies API requests to Fastify on `http://localhost:3000`. For the production-shaped local check, run `npm run build` followed by `npm start`; Fastify serves the built dashboard and API. The README must include required Playwright system dependencies if the Codespace image does not already provide them. No NVIDIA key is required for the deterministic demo.

### Public Hosting Gate

Render Docker Web Service is a candidate, not a commitment. Render's official Docker documentation confirms Docker-based deploys. Its Free web-service documentation currently specifies 0.1 CPU and 512 MB RAM, spin-down after 15 idle minutes, roughly one minute to spin up, ephemeral filesystems, and possible charges for outbound-bandwidth overage. Its docs do not establish that a service can request the Chromium sandbox/seccomp and network restrictions required here. Browser memory requirements have not been measured.

Before a public URL is promised, verify all of the following without enabling paid billing:

- The deployment can run Chromium as a non-root user with its sandbox enabled and the required seccomp restrictions; the same-deployment worker is not treated as sandboxed merely because it is a separate process.
- Network egress from the browser is restricted to the local controlled demo, not just blocked by a Playwright request hook.
- A clean run and regression replay fit the host's measured memory, CPU, timeout, and concurrency limits with headroom.
- The browser package/image compatibility is pinned, the service survives a complete real-browser run, and restart/cold-start behavior cannot return stale results.
- A no-cost configuration cannot silently exceed included bandwidth or trigger paid resources. If this cannot be guaranteed, do not deploy there.

If any security, resource, browser, or cost gate fails, the public deployment stays off. Do not switch to a separate runner service, paid host, weaker sandbox, or extra infrastructure without explaining the implications and obtaining the learner's approval. Use the working Codespaces demonstration, public source repository, and under-three-minute authentic video as the submission path.

The required public repository and short demo video remain necessary regardless of deployment. A live URL is an additional goal, never a substitute.

## Look and Feel

Implement `prd.md > Look and Feel`: a premium, original deep-navy/charcoal dashboard with restrained cyan/blue accents and text-labeled green, amber, and red outcomes. Use readable sans-serif UI typography and monospace only for code, logs, shortcuts, and evidence. Keep the workspace responsive and spacious, with mouse/keyboard comparison and event timeline as the visual focus.

Use semantic React controls, visible focus styles, sufficient contrast, keyboard-operable scenario selection and evidence panels, and `prefers-reduced-motion`. Status meaning must remain clear without color. No copied product branding, generic chatbot layout, simulated progress, or decorative motion that obscures evidence.

## Components

### React Dashboard

Owns the first screen, scenario selection, mouse baseline preview, execution progress, side-by-side comparison, accessible status, evidence controls, retry, and regression replay view. Sends only scenario IDs to the public start endpoint and renders only server-reported run events/results.

Implements `prd.md > Screens and Layout`, `Look and Feel`, `Dashboard and Scenario Selection`, `Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`.

### Fastify API

Serves the production Vite build and owns the public API. Static request/response schemas are source-controlled; start accepts only the three scenario IDs and rejects additional properties. Applies body-size limits, rate limits, result access checks, and same-origin policy. It has no endpoint for arbitrary browser control.

#### Public Route Contract

- `POST /api/runs` accepts only `{"scenarioId":"broken"}`, `{"scenarioId":"fixed"}`, or `{"scenarioId":"alternative"}`. The JSON Schema requires exactly `scenarioId`, sets `additionalProperties: false`, and rejects unknown values before starting a worker. The request body limit is 1 KB. Success returns `202` with an opaque `runId` and the run-events URL. Busy or rate-limited requests return a clear `429` or `503`, not a fabricated run result.
- `GET /api/runs/:runId/events` streams validated progress/result events as `text/event-stream`; the browser uses native `EventSource`. Events contain no secrets or arbitrary worker strings.
- `GET /api/runs/:runId` returns only the actual in-memory status, assertion, sanitized reason, and replay result. Unknown IDs return `404`; expired/lost run data returns `410` and is not reconstructed from cache.
- `GET /api/runs/:runId/artifacts/:artifactId` serves only a fixed artifact ID recorded for that run; it never treats a path as a filesystem location.
- `GET /api/runs/:runId/report` downloads a generated JSON evidence report containing actual status, booking assertion, event summary, and available artifact IDs. It is available only when supporting evidence exists and excludes secrets, environment values, and local paths.
- `GET /api/runs/:runId/regression-test` serves the generated standalone `.spec.ts` only after independent confirmation and actual broken/fixed replay. Otherwise it returns `404`.
- Regression replay is started internally by the worker after a confirmed failure; there is no public endpoint for arbitrary browser actions or test commands.

Use source-controlled response schemas for run status and error envelopes. The only public run input is the scenario identifier; no URL, selector, uploaded file, script, model prompt, or command is accepted.

Implements `prd.md > Dashboard and Scenario Selection`, `States and Boundaries`.

### Run Coordinator

Owns in-memory run records, global concurrency, timeouts, progress forwarding, result classification handoff, and cleanup. Starts a fixed runner program with a fixed argument shape; never calls a shell with request data. A busy or rate-limited service rejects a new run clearly instead of building an unbounded queue.

#### Provisional Run Limits

These are initial engineering defaults for the draft, to be checked with real Codespaces runs before hosting; they are not measured performance claims:

- One active Playwright worker per service instance; no waiting queue.
- Maximum 5 run starts per client IP per minute and 1 KB per start request. Honor forwarded client addresses only from the configured hosting proxy.
- Maximum 120 seconds wall time for a comparison including required regression replay; one AI request per run with an 8-second timeout, then use the deterministic plan.
- Maximum 10 MB of captured artifacts per run and 10 minutes of temporary result/artifact retention, followed by deletion.
- Measure the worker's peak memory/CPU in Codespaces. Public deployment requires an enforceable host-level limit with headroom; do not assume a process timeout limits memory or network access.

Implements `prd.md > Browser Execution and Comparison`, `States and Boundaries`.

### Internal Playwright Worker

Runs as a separate process and under a restricted OS user/container boundary where the platform supports it. Receives only a scenario ID and validated action IDs through private IPC. It has no NVIDIA credential, no arbitrary URL or file input, no shell-command interface, and no public route. Launches Chromium with its sandbox enabled. Enforces per-run deadlines and resource/artifact caps, emits structured events, and always closes browser/server/temp files on success, failure, timeout, or cancellation.

**Security gate:** process separation is not a sandbox. Do not expose this worker publicly or deploy it unless host-level isolation, filesystem access, egress restriction, and resource limits are verified. Playwright's Docker guidance says running as root disables its sandbox and recommends an unprivileged user plus seccomp for untrusted sites.

Implements `prd.md > Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`, `States and Boundaries`.

### Controlled Booking Fixture and State Oracle

Hosts only the local demo page and its three source-defined variants: broken confirmation, fixed confirmation, and valid alternative keyboard route. Each worker run creates independent initial booking data and separate mouse/keyboard contexts. The oracle reads the fixture's server-owned booking state, not rendered text, AI commentary, or the dashboard status. The fixture binds to loopback on a run-selected port and is stopped during cleanup.

The alternate route adds a clearly labeled `Enter new date` text field and a separate `Save new date` submit button within the same rescheduling form. The visible hint specifies the locale-independent date-only format `YYYY-MM-DD`; the fixture strictly rejects malformed or impossible calendar dates without changing booking state. This is a technical format default for review, not a claim that the learner specified the format.

Implements `prd.md > Dashboard and Scenario Selection`, `Browser Execution and Comparison`, `States and Boundaries`.

### Scenario and Action Catalog

Maps the three fixed scenario IDs to controlled demo configuration, expected booking state, deterministic fallback action IDs, and the intended keyboard behavior. Action IDs map to a small source-defined set of Playwright keyboard operations. Model output can select only allowed IDs for its scenario; invalid, missing, or unsafe output falls back deterministically. No model-generated selector, URL, JavaScript, or test source is executed.

#### Scenario Acceptance Criteria

| Scenario | Real browser journey | Independent assertion and result |
|---|---|---|
| `broken` | A mouse run activates the primary `Confirm Reschedule` control and saves the date. From an equivalent fresh state, the keyboard run navigates to that control and tests Enter and Space on separate reset states; neither activation saves the date. | The mouse oracle confirms the expected date. Each keyboard oracle confirms the date remains unchanged. Report Confirmed Failure only when both baselines and the specific keyboard activation defect reproduce. |
| `fixed` | On fresh equivalent states, the mouse activates `Confirm Reschedule`; keyboard-only runs reach it naturally and activate it using Enter and Space. | The oracle confirms the expected date for mouse and keyboard. Both activation methods pass. |
| `alternative` | From a fresh state, use Tab/Shift+Tab to reach the reschedule form and naturally focus `Enter new date`; type the expected ISO date with Playwright keyboard input; Tab to `Save new date`; activate the semantic submit button with Enter or Space. Do not click, call programmatic focus/fill, dispatch events, or set DOM/application state directly. | The oracle confirms the saved date. Report Passed for task completion. Failure to activate the primary button is not a confirmed task-completion failure when this valid route succeeds; do not generate a task-failure regression test for the completed route. |

For keyboard routes, use Playwright keyboard events such as `keyboard.press('Tab')`, `keyboard.press('Shift+Tab')`, `keyboard.type(expectedDate)`, `keyboard.press('Enter')`, and `keyboard.press('Space')`. A focus assertion may verify natural tab order, but must not move focus. The fixture's booking-state oracle is the only completion authority.

Implements `prd.md > Dashboard and Scenario Selection`, `Browser Execution and Comparison`.

### AI Provider Adapter

Lives in the Fastify/API service only. Defines a provider-neutral request/result contract; NVIDIA Build is an optional adapter enabled only when its endpoint, model, free allowance, authorization, and response compatibility are verified. It receives only the fixed task description and non-sensitive scenario data. Strictly validates bounded output and has a timeout and usage cap. Errors or absence select the deterministic action catalog and never change the outcome verdict.

No provider request is made and no key or paid resource is assumed until access is confirmed. Implements `prd.md > Browser Execution and Comparison`, `Evidence, Retry, and Regression Test`.

### Evidence and Regression Replay

Captures real screenshots/traces/logs with Playwright, redacts headers, environment values, secrets, and local paths, and stores artifacts in a per-run temporary directory. Exposes only artifacts belonging to a valid opaque run ID, with bounded size and retention. When supporting evidence exists, creates a downloadable JSON report from actual run data. Generates a regression `.spec.ts` from a fixed template only after a Confirmed Failure. The generated test contains no AI call and uses only the controlled demo and fixed scenario IDs. The worker actually executes it against broken and fixed variants and reports both results.

Implements `prd.md > Evidence, Retry, and Regression Test`, `States and Boundaries`.

## Data Model

- **Scenario ID:** enum of the three source-defined scenarios: `broken`, `fixed`, and `alternative`. No user-defined scenario values.
- **Run record:** opaque random ID, scenario ID, lifecycle/result status, timestamps, actual event list, independent assertion result, sanitized error reason, and references to any real temporary artifacts or generated regression file. Held in bounded memory only; a service restart invalidates the run rather than reconstructing or caching a result.
- **Booking fixture state:** per-run initial booking and selected date, created fresh for mouse and keyboard comparisons. Lives only in the worker's test fixture memory and is deleted at worker exit.
- **Action plan:** a bounded list of source-defined action IDs for the selected scenario. May come from the deterministic catalog or a schema-validated AI proposal. It is not code, CSS, a selector, a URL, or a shell argument.
- **Evidence:** real Playwright artifacts under a unique OS temporary directory, with strict size/age caps and deletion in a `finally` cleanup path. No production database or persistent disk.

## File Structure

```text
switchpath/
├── src/
│   ├── client/
│   │   ├── main.tsx                 # React entry
│   │   ├── App.tsx                  # Dashboard journey and results
│   │   ├── components/              # Comparison, timeline, evidence, status UI
│   │   └── styles/                  # Tokens, responsive and accessible styles
│   ├── server/
│   │   ├── index.ts                 # Fastify startup and static dashboard
│   │   ├── routes/                  # Scenario-only run/result/evidence routes
│   │   ├── schemas/                 # Static JSON Schema request/response shapes
│   │   ├── run-coordinator.ts       # Limits, worker lifecycle, memory run records
│   │   └── ai/                      # Provider interface and NVIDIA adapter
│   ├── runner/
│   │   ├── worker.ts                # Internal process entry and private IPC
│   │   ├── scenarios.ts             # Fixed scenario/action catalog
│   │   ├── booking-fixture.ts       # Loopback demo server and per-run state
│   │   ├── oracle.ts                # Independent booking-state assertions
│   │   ├── evidence.ts              # Capture, report, redaction, caps, cleanup
│   │   └── regression-template.ts   # Fixed standalone test template and replay
│   └── shared/contracts.ts          # Shared scenario IDs and result/event types
├── tests/
│   ├── api.test.ts                  # Validation, limits, result classification
│   ├── scenarios.spec.ts            # Real browser broken/fixed/alternative runs
│   └── generated/                   # Temporary generated regression test output
├── devpost/                         # Scope, PRD, spec, and visual companions
├── Dockerfile                       # Candidate deployment image; gated on sandbox
├── package.json                     # Scripts and pinned dependency ranges
├── package-lock.json                # Reproducible dependency versions
├── tsconfig.json                    # Shared TypeScript baseline
├── vite.config.ts                   # React frontend build
├── playwright.config.ts             # Browser projects and test timeouts
├── .env.example                     # Variable names only; no secret values
├── .gitignore                       # Local secrets, artifacts, temp output
└── README.md                        # Setup, security limits, demo and fallback
```

Generated dependencies and browser binaries are installed by documented setup commands and are not committed. No real `.env` file, API key, trace, or user data is committed.

## External Services and Dependencies

| Service/dependency | Use | Documentation and verification |
|---|---|---|
| Node.js | TypeScript runtime for API, worker, and tests | [Node.js documentation](https://nodejs.org/docs/latest/api/). Pin a supported LTS in the repo and verify Vite/Playwright compatibility during scaffold. |
| React + Vite + TypeScript | Dashboard and frontend build | [React](https://react.dev/learn), [Vite](https://vite.dev/guide/), [TypeScript](https://www.typescriptlang.org/docs/). No external runtime service. |
| Fastify + JSON Schema | HTTP service and strict input/output validation | [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/). Its docs warn schemas use code generation and must not come from untrusted request data. |
| `@fastify/rate-limit` | Per-client HTTP request limiting | [Fastify rate-limit plugin](https://github.com/fastify/fastify-rate-limit). Configure trusted proxy handling only for the selected host. |
| Playwright for Node.js | Real browser execution, screenshots/traces, and regression replay | [Playwright Docker guidance](https://playwright.dev/docs/docker). Pin package and browser image to the same release. Official guidance warns root disables Chromium's sandbox; host must permit a non-root browser and required seccomp controls. |
| `@playwright/test` and `node:test` | Browser/regression test runner and built-in unit-test runner | [Playwright Test](https://playwright.dev/docs/test-intro), [Node test runner](https://nodejs.org/api/test.html). |
| NVIDIA Build | Optional server-side inference | [NVIDIA Build](https://build.nvidia.com/). API endpoint, model catalog compatibility, free allowance, rate limits, and auth are **unverified**. No key or live API call is assumed. Verify against current official docs and authorized account access before enabling. |
| Render | Candidate public Docker Web Service | [Render Docker](https://render.com/docs/docker), [Render free services](https://render.com/docs/free), [Render web services](https://render.com/docs/web-services). Docker is supported, but current Free resource/idle/bandwidth limits and sandbox support have not been shown suitable for this runner. Do not create or promise the service until verified; do not enable billing. |

No database, queue, hosted browser provider, or extra service is selected. Adding one requires a concrete gap, a cost/security review, and learner approval.

## Important Failure Modes

- **Runner cannot start safely or exceeds verified limits** → fail closed as Test Error; do not classify a keyboard defect or promise a public URL. Use Codespaces for the genuine demo.
- **Playwright timeout, browser crash, or fixture navigation failure** → show Test Incomplete and the actual reason; classify infrastructure failure as Test Error. Clean up browser, fixture, and temporary state.
- **Independent oracle cannot read a definitive booking state** → Inconclusive — Completion Not Verified. Never infer from UI labels or AI explanation.
- **NVIDIA unavailable, unauthorized, rate-limited, slow, or invalid output** → discard the proposal and use the deterministic scenario action plan; test verdict stays based on actual execution and oracle.
- **Public start rate/concurrency limit reached** → reject the new run with a clear retryable busy/rate-limited response; do not queue unbounded work or show cached outcomes.
- **Evidence redaction or capture fails** → report only artifacts actually available; do not create a confirmed-failure test without the required independent proof.
- **Host restarts or an in-memory run is lost** → mark the run unavailable/incomplete; never show stale results as a new run.

## What Was Simplified and Why

- One controlled booking fixture instead of arbitrary public websites — avoids SSRF and untrusted-page browsing while proving the core comparison.
- Three fixed scenario IDs and source-defined action catalogs instead of user-authored selectors/scripts — closes the public command/browser-control surface.
- Temporary per-run state instead of a database — the demo needs clean reproducible tests, not persistence or accounts.
- One API deployment and an internal worker process instead of a queue service — fewer services and accounts; only viable if the process is also protected by verified OS/container/network controls.
- NVIDIA behind an optional adapter with deterministic plans instead of a required paid/credentialed AI dependency — the proof remains testable without access or credits.
- CSS custom properties instead of a large design framework — preserves the approved visual identity and reduces setup.

## Decisions and Open Issues

### Learner-Approved Decisions

- React + TypeScript + Vite; Node.js + TypeScript; Playwright for Node.js; and Fastify with TypeScript and JSON Schema are the selected stack.
- The initial deployment target is a restricted runner process in the app deployment, but only after successful sandbox, browser, memory, and hosting verification. Process separation alone is explicitly insufficient.
- NVIDIA Build is the preferred hosted provider only if free access and model compatibility are confirmed. The API remains replaceable; no access or billing is assumed.
- All three scenarios work through deterministic non-AI action plans. AI proposes restricted actions or explains sanitized evidence; it never determines outcomes.
- The learner chose the alternative route: keyboard-only Tab/Shift+Tab navigation, direct date entry, then a separate Save new date action. The specification proposes strict ISO `YYYY-MM-DD` input to make the keyboard entry deterministic and locale-independent.
- No login, production database, arbitrary URLs, user-provided code, or unrestricted browser automation is part of the MVP.
- If a secure no-cost deployment cannot be established, use the Codespaces demonstration, public source, and authentic video. A separate runner service or paid host requires a new explanation and approval.

### Open Verification Issues

- **Public runner sandbox and host limits (blocks live deployment):** Render's docs confirm Docker web services and Free plan limits of 0.1 CPU/512 MB, idle spin-down, ephemeral filesystem, and possible bandwidth overage charges. They do not establish the runtime seccomp/network isolation required by this worker. Benchmark Chromium memory and verify sandbox, non-root execution, outbound controls, resource ceilings, and no-overage billing protection before any public URL. If any check fails, leave deployment off.
- **NVIDIA provider contract (does not block Codespaces build):** exact endpoint, model, authorized no-cost allowance, rate limit, and response format are not confirmed. Verify only if the learner has authorized access; otherwise keep the adapter disabled and use deterministic plans.
- **Browser/image version (blocks deploy, not local architecture):** select and pin one Playwright package and matching browser image after Codespaces testing. The Playwright docs' `1.64.0` image example is not itself a selection.
- **One useful uncertainty:** whether the chosen cloud runtime can enforce the Chromium sandbox and network boundary for a public test runner. Resolve by checking host-level controls and measured browser resource use; evidence must show non-root Chromium with sandbox active, disallowed egress blocked outside the browser API, and successful clean-run/replay within measured limits. No such verification has yet been performed.