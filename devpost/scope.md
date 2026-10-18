---
doc: scope
status: approved
---

# SwitchPath

SwitchPath turns a successful mouse workflow into independently reproducible evidence of whether the same task can be completed with a keyboard.

## The Unique Kernel

Rather than report generic accessibility findings, SwitchPath compares actual mouse and keyboard task outcomes from equivalent starting states. A reproducible keyboard failure is supported by browser evidence and an independently checked task-completion condition, then captured as a standalone Playwright regression test. A different but valid keyboard route must still count as success.

## Who It's For

Frontend developers, QA testers, and small web development teams building booking, registration, and other interactive websites. They need to check whether a complete task works without a mouse; today they may test manually with keyboard keys, write Playwright tests, or use accessibility scanners that do not necessarily verify task completion.

## The Core Loop

The developer provides a successful mouse workflow and a measurable completion condition. SwitchPath runs the mouse journey and a proposed keyboard equivalent in a real browser from equivalent initial states, compares the checked outcomes, and presents reproducible evidence and a regression test when the keyboard task fails. A valid alternative keyboard sequence is treated as completion, not a failure.

## Inspiration & Identity

The experience should be simple enough for a junior developer and technically credible to an experienced QA engineer. No specific visual reference or aesthetic direction has been chosen yet.

## Why This Matters to the Learner

The learner wants to make keyboard-task testing easier and more reproducible, while building reliable, measurable software and strengthening specification-driven development skills. They want a differentiated, functioning project for the Devpost competition and their portfolio.

## What "Working" Looks Like

In a short demonstration, a developer tests one controlled booking-rescheduling workflow. The mouse run saves the new date. From the same reset state, the deliberately broken keyboard run fails to activate Confirm Reschedule with Enter or Space, and SwitchPath shows the failed action, browser evidence, and an independent booking-state assertion. An exported standalone Playwright regression test fails on that broken version and passes on the fixed version. A valid alternative keyboard route completes the task and is not reported as a failure.

## The POC Boundary

One controlled booking demo with an existing booking, date selection, and Confirm Reschedule control. Prove the comparison with three scenarios: a reproducible broken keyboard interaction, its fixed version, and a valid alternative keyboard route. Use real Playwright browser execution and independently checked task state; generated explanations alone are not proof. Keyboard execution must not use mouse clicks or DOM manipulation to complete the task.

## Later

Support additional websites, booking or registration workflows, and other interactive tasks after the controlled proof of concept is reliable.

## Explicitly Cut

- Certifying entire websites as accessible: the POC tests one task and must not imply broader coverage.
- Replacing general-purpose accessibility scanners: the distinctive goal is end-to-end task completion evidence, not generic scanning.
- Treating an unsuccessful bounded keyboard search as proof of a defect: a failure must be reproducible and contradicted by the independent completion check.