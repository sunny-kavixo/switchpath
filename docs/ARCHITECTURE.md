# Implementation notes

- [Dashboard](../src/client/App.tsx): native scenario controls, run start, polling/events, comparison, timeline, retry and named evidence downloads.
- [API](../src/server/app.ts): validates a closed scenario enum, rejects extra fields, limits starts, reserves worker admission before asynchronous setup, validates outcomes and serves bounded artifacts. A result-finalization guard prevents worker exit from overwriting asynchronous result handling.
- [Worker](../src/runner/worker.ts): launches sandboxed Chromium, restricts requests to the exact fixture origin, blocks service workers and runs real input from fresh states. Environment values are allowlisted by the server.
- [Fixture](../src/server/booking-fixture.ts): keeps booking state independently readable. The broken control accepts click but lacks keyboard activation; the fixed version uses a native button. The alternate route supports direct date entry.
- [Regression template](../src/runner/regression-template.ts): emits a fixed Playwright test for the repository fixture; replay checks broken and fixed variants. This is deterministic source generation, not a model call.
- [Backend checks](../src/server/app.test.ts): validate request boundaries, date validity, rate/concurrency limits and error semantics.
- [Browser checks](../tests/dashboard.spec.ts): keyboard operation, narrow layout and error presentation, alongside the scenario tests.

The worker is a separate process, not a substitute for host-level isolation. No arbitrary navigation, arbitrary command input, public authentication or durable booking database is provided.
