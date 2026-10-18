# Demonstrate SwitchPath

Objective: reproduce a mouse/keyboard task-completion difference, compare the fixed fixture, and show that a valid alternative keyboard route succeeds.

## Start the app

Follow the Node/npm/Chromium prerequisites and environment exports in the [README](../README.md). Stop development servers before starting the built dashboard:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3000 on the same machine. Use a trusted local environment; keep Chromium sandboxing enabled.

## Compare three scenarios

1. Select **Broken confirmation**, then **Start Accessibility Test**. Wait for completion. Mouse should save October 20; Enter and Space should retain October 10. Inspect the observed dates and regression replay summary.
2. Download the evidence report and standalone test using their displayed links. Screenshots alone do not establish saved state; compare the report with the independently checked dates.
3. Select **Fixed confirmation** and start again. Mouse, Enter and Space should each save October 20.
4. Select **Direct date-entry route** and start again. Keyboard navigation, typed date and Save should produce October 20. This alternative route counts as completion.
5. Use the [gallery](GALLERY.md) to compare the recorded outcomes, including a narrow dashboard layout.

The application chooses controlled fixtures; there is no website URL field. A native button fixes the demonstrated activation behavior; SwitchPath does not rewrite arbitrary applications.

## Replay and interpret

Follow the [README replay commands](../README.md#evidence-and-regression-replay). Broken replay exits 1 with an expected booking assertion failure; fixed replay exits 0. The downloaded test requires this repository and its fixture module.

Browser startup failure or timeout is Test Error / Test Incomplete. Insufficient completion evidence is inconclusive. Neither should be presented as a verified accessibility defect. Evidence is temporary; download before expiry. For independent reruns and actual historical results, see [testing](TESTING.md).
