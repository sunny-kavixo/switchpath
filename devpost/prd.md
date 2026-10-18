---
doc: prd
status: approved
---

# SwitchPath — Product Requirements

SwitchPath helps frontend developers, QA testers, and small web teams compare mouse and keyboard completion of one controlled booking-rescheduling task and preserve independently verified regression evidence.
Source: `scope.md > The Unique Kernel`, `Who It's For`, `The Core Loop`.

## The Core Journey

1. The user opens the SwitchPath dashboard and sees the headline “Your mouse works. Does your keyboard?” and the primary action “Start Accessibility Test.” The controlled booking demonstration and its broken, fixed, and valid-alternative scenarios are accessible from this first screen.
2. The user selects the controlled booking scenario and reviews the successful mouse journey and its expected booking-state outcome.
3. The user starts the keyboard-equivalent test. SwitchPath begins real browser execution from a clean state equivalent to the mouse run and shows progress only as it actually occurs.
4. SwitchPath proposes keyboard interactions based on the mouse journey and executes them with keyboard input. The keyboard path must not use mouse clicks or DOM manipulation to complete the task.
5. SwitchPath checks the resulting booking state independently, then compares it with the successful mouse baseline.
6. The user reviews a side-by-side comparison, a timeline of events, and the outcome. When a specific keyboard defect is independently reproduced, the result identifies the failed interaction and provides authentic supporting evidence.
7. For a confirmed failure, the user can download a standalone Playwright regression test and inspect its replay verification: it fails on the broken version and passes on the fixed version. A valid alternative keyboard route that reaches the expected booking state is reported as passed.

Source: `scope.md > The Core Loop`, `What "Working" Looks Like`, `The POC Boundary`.

## Screens and Layout

The product has one primary responsive dashboard workspace.

- The opening view establishes the purpose with the agreed headline and primary action.
- The workspace gives access to the controlled booking-rescheduling demonstration and its broken, fixed, and valid-alternative scenarios. It shows the successful mouse journey and expected completion outcome before a test starts.
- During a run, the workspace presents genuine execution progress. Afterward it presents mouse and keyboard outcomes side by side, with a readable event timeline and the relevant task assertion.
- Evidence and regression-test replay details are available with the result when they exist. Controls and status descriptions remain understandable without color.

Source: `scope.md > The Core Loop`, `What "Working" Looks Like`, `The POC Boundary`.

## Look and Feel

Create a distinctive, premium developer-tool interface: sophisticated, minimal, futuristic but professional, never a generic chatbot or gaming dashboard. Use deep navy and charcoal backgrounds, subtle blue/cyan accents, and restrained green, amber, and red for meaningful outcomes. Use clean, readable modern sans-serif typography for the interface; reserve monospace for code, logs, keyboard shortcuts, and technical evidence. Use a spacious responsive dashboard, clear navigation, rounded panels, consistent spacing, and strong hierarchy. Make the mouse-versus-keyboard comparison and event timeline the main visual feature. Transitions should be subtle and purposeful.

The dashboard itself must be keyboard-operable, use semantic controls, show visible keyboard focus, maintain WCAG-conscious contrast, respect reduced-motion preferences, and identify statuses with text and descriptions rather than color alone. Make complex evidence approachable to junior developers while retaining useful technical detail for QA engineers. Draw on the clarity and polish of professional development platforms without copying a product's interface, branding, or layout.

The opening headline is “Your mouse works. Does your keyboard?” The primary action is “Start Accessibility Test.”

Source: `scope.md > Inspiration & Identity`; learner-approved visual direction.

## Features and Behavior

### Dashboard and Scenario Selection

The dashboard exposes one controlled booking-rescheduling task, with an existing booking, date-selection control, and Confirm Reschedule action. From the first screen, the user can access three scenarios: the deliberately broken keyboard interaction, its fixed version, and a valid alternative keyboard route. Before running, the user can review the successful mouse journey and the expected booking-state outcome.

- The mouse baseline uses the mouse to select a new date and confirm; its saved booking state is the reference outcome.
- Each comparison begins from an equivalent clean initial state.
- The application does not present results from a run that has not actually executed.

Source: `scope.md > The Core Loop`, `What "Working" Looks Like`, `The POC Boundary`.

### Browser Execution and Comparison

Starting the keyboard test runs actual browser interactions. SwitchPath proposes a keyboard-equivalent route from the mouse journey, then executes using keyboard input only. Visible progress reflects genuine execution, not a simulated animation or fabricated activity. The comparison shows the mouse baseline and keyboard outcome side by side and places events in an understandable timeline.

- **Passed:** the keyboard task reaches the expected booking state and the independent booking-state assertion passes. A different valid keyboard route is also success.
- **Confirmed Failure:** a specific keyboard interaction defect is reproduced; the independent outcome check supports the failure; and the mouse baseline comparison is valid.
- **Inconclusive:** execution completed only partially or the available evidence cannot establish success or failure. If the independent completion check cannot establish the outcome, show “Inconclusive — Completion Not Verified.”
- **Test Error:** browser or test infrastructure failed. When execution cannot complete, show “Test Incomplete” and the actual reason, such as browser startup failure, navigation timeout, or execution error.

“Test Incomplete” describes the execution state; it is not a defect verdict. A browser or infrastructure failure is “Test Error.” Missing verification or insufficient task evidence is inconclusive. A timeout, an unsuccessful bounded search, AI-generated explanation, or missing evidence alone never establishes inaccessibility.

Source: `scope.md > The Unique Kernel`, `The Core Loop`, `What "Working" Looks Like`, `The POC Boundary`; learner-approved product behavior requirements.

### Evidence, Retry, and Regression Test

For unsuccessful tests, the user can read a plain explanation, review the task-completion assertion, inspect authentic evidence when available, and retry from a clean state equivalent to the original starting state. Available evidence may include screenshots, browser traces, and execution logs. An evidence report can be downloaded when supporting evidence exists; the application must not manufacture evidence to fill gaps.

A standalone Playwright regression test is generated only for a confirmed, independently verified keyboard failure. The user can download it and inspect replay verification: it reproduces the failure on the broken version and passes on the fixed version. A valid alternative keyboard route is not turned into a failure test.

Source: `scope.md > The Unique Kernel`, `What "Working" Looks Like`, `The POC Boundary`; learner-approved product behavior requirements.

## States and Boundaries

- **Ready:** the dashboard introduces the product and exposes the controlled booking demo and scenarios. No test result is implied before execution.
- **Running:** actual browser execution is underway; displayed progress and timeline entries correspond to real execution.
- **Passed:** the keyboard task completed and the independent booking-state assertion passed, including a valid alternative route.
- **Confirmed Failure:** all three conditions hold: a specific keyboard defect was reproduced, independent task-state evidence supports the failure, and the mouse comparison is valid.
- **Inconclusive — Completion Not Verified:** the independent assertion cannot establish whether the booking task completed. Do not claim a defect.
- **Inconclusive:** partial execution or insufficient evidence prevents a success or failure conclusion.
- **Test Incomplete / Test Error:** execution could not finish; show the actual reason. Classify a browser or test-infrastructure failure as Test Error, never as a confirmed keyboard defect.
- **Retry:** a retry starts from a clean state equivalent to the comparison's original state.
- **Evidence unavailable:** show only evidence that was actually captured; make no claim that unavailable evidence supports a result.
- **Regression replay:** show the actual replay outcome on the broken and fixed versions. Do not imply verification before those runs occur.

Source: `scope.md > The Core Loop`, `What "Working" Looks Like`, `The POC Boundary`; learner-approved product behavior requirements.

## Product Decisions

- The POC serves frontend developers, QA testers, and small teams, not general website visitors. This keeps the experience useful for people who need to test interactive workflows.
- The first demonstration is limited to one controlled booking-rescheduling task, with broken, fixed, and valid-alternative keyboard scenarios.
- A task-state assertion and a valid mouse baseline, not an AI explanation, determine whether a keyboard defect is confirmed.
- A valid alternate keyboard route counts as success even if it differs from the proposed route.
- Browser/infrastructure failure, incomplete execution, inconclusive verification, and confirmed accessibility failure must not be conflated.
- The interface should pair a premium, original dark developer-tool identity with accessible interaction and readable evidence.

## What We're Building

- One responsive dashboard with the agreed headline, primary action, and access to the controlled booking workflow and three scenarios.
- A reviewable successful mouse journey and expected booking-state outcome.
- Real browser execution of the mouse and keyboard paths from equivalent clean initial states, with genuine progress and an independent booking-state assertion.
- A side-by-side comparison and event timeline with clear outcome descriptions.
- Trustworthy error, incomplete, and inconclusive states, authentic evidence inspection, clean retry, and evidence-report download when evidence exists.
- A standalone regression test only for independently confirmed defects, with real replay verification on broken and fixed versions.
- Keyboard-accessible, responsive dashboard controls and status descriptions that do not rely on color.

## Deferred From the POC

- Support for arbitrary external websites or user-defined workflows; the first proof uses one controlled booking demo.
- Additional booking, registration, or other interactive tasks; expand only after the controlled proof is reliable.
- Whole-site accessibility certification; a single task cannot establish whole-site conformance.

## Possible Later Enhancements

Additional websites and interactive workflows may be considered after the controlled proof of concept is reliable.

## Non-Goals

- Certifying entire websites as accessible: this POC evaluates one task and must not imply wider coverage.
- Replacing general-purpose accessibility scanners: SwitchPath demonstrates end-to-end task completion evidence rather than generic scanning.
- Calling a timeout, bounded-search failure, missing evidence, or infrastructure error a keyboard defect: these do not prove inaccessibility.
- Using mouse clicks or DOM manipulation to complete the keyboard journey: the keyboard result must represent keyboard-only interaction.
- Fabricating execution progress, evidence, task outcomes, or regression replay results.

## Open Questions

- No additional product decision is required before specification based on the current interview. Architecture, browser-runner design, AI provider, and deployment approach are intentionally reserved for `4-spec`.