import { useState } from 'react';

type RunResult = {
  status: 'submitting' | 'running' | 'passed' | 'confirmed_failure' | 'inconclusive' | 'test_error';
  reason?: string;
  executionState?: 'running' | 'completed' | 'incomplete';
  events?: Array<{ stage: string; message: string; timestamp: string }>;
  artifacts?: Array<{ id: string; contentType: string; size: number }>;
  result?: {
    scenarioId: 'broken' | 'fixed' | 'alternative';
    status: 'passed' | 'confirmed_failure' | 'inconclusive';
    mouse: { initialDate: string; expectedDate: string; observedDate: string; verified: boolean };
    keyboard: Array<{
      key: 'Enter' | 'Space' | 'Direct date entry';
      focusedConfirm: boolean;
      focusedDateField?: boolean;
      focusedSaveAction?: boolean;
      initialDate: string;
      observedDate: string;
      unchanged: boolean;
      completed: boolean;
    }>;
    regressionReplay?: {
      brokenExitCode: number | null;
      fixedExitCode: number | null;
      brokenFailsAsExpected: boolean;
      fixedPasses: boolean;
    };
  };
};

type ScenarioId = 'broken' | 'fixed' | 'alternative';

const scenarioLabels: Record<ScenarioId, string> = {
  broken: 'Broken confirmation',
  fixed: 'Fixed confirmation',
  alternative: 'Direct date-entry route',
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Time unavailable'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function App() {
  const [run, setRun] = useState<RunResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('broken');
  const [runId, setRunId] = useState<string>();
  const [progressMessage, setProgressMessage] = useState('Preparing a fresh isolated run.');

  async function startTest() {
    setStarting(true);
    setRun({ status: 'submitting' });
    setRunId(undefined);
    setProgressMessage('Submitting the selected scenario.');
    let eventStream: EventSource | undefined;
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) {
        const error = (await response.json()) as { message?: string };
        setRun({ status: 'test_error', reason: error.message ?? 'The run could not start.' });
        return;
      }
      const { runId } = (await response.json()) as { runId: string };
      setRunId(runId);
      setRun({ status: 'running' });
      eventStream = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
      eventStream.addEventListener('progress', (event) => {
        try {
          const progress = JSON.parse((event as MessageEvent<string>).data) as { message?: unknown };
          if (typeof progress.message === 'string') setProgressMessage(progress.message);
        } catch {
          setProgressMessage('Receiving browser run progress.');
        }
      });
      for (;;) {
        const resultResponse = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        if (!resultResponse.ok) {
          setRun({ status: 'test_error', reason: 'The run result is unavailable.' });
          return;
        }
        const result = (await resultResponse.json()) as RunResult;
        setRun(result);
        if (result.status !== 'running') return;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    } catch {
      setRun({ status: 'test_error', reason: 'The API could not be reached.' });
    } finally {
      eventStream?.close();
      setStarting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#main" aria-label="SwitchPath home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SwitchPath</span>
        </a>
        <span className="topbar-context">ACCESSIBILITY TESTING</span>
        <nav className="primary-nav" aria-label="Main navigation">
          <a href="#test-workspace" aria-current="page">Test workspace</a>
          <a href="#run-evidence">Evidence</a>
        </nav>
      </header>

      <section className="hero" id="main" aria-labelledby="headline">
        <p className="eyebrow">Keyboard task verification</p>
        <h1 id="headline">Your mouse works.<br />Does your keyboard?</h1>
        <p className="intro">Compare a working mouse journey with a real keyboard-only run. Task completion is checked against the booking state, not an AI verdict.</p>
        <fieldset className="scenario-picker" disabled={starting}>
          <legend>Choose a controlled scenario</legend>
          {(Object.keys(scenarioLabels) as ScenarioId[]).map((id) => (
            <label className={scenarioId === id ? 'scenario-option selected' : 'scenario-option'} key={id}>
              <input type="radio" name="scenario" value={id} checked={scenarioId === id} onChange={() => setScenarioId(id)} />
              <span>{scenarioLabels[id]}</span>
            </label>
          ))}
        </fieldset>
        <div className="task-facts" aria-label="Expected booking task state">
          <div><span>BOOKING</span><strong>BK-2048</strong></div>
          <div><span>CLEAN START</span><strong>2026-10-10</strong></div>
          <div><span>EXPECTED DATE</span><strong>2026-10-20</strong></div>
        </div>
        <button className="primary-action" type="button" onClick={startTest} disabled={starting}>
          {starting ? 'Running Playwright test…' : 'Start Accessibility Test'}
        </button>
      </section>

      <section className="workspace" aria-labelledby="workspace-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONTROLLED DEMONSTRATION</p>
            <h2 id="workspace-title">Booking reschedule</h2>
          </div>
          <span className="scenario-tag">{scenarioLabels[run?.result?.scenarioId ?? scenarioId].toUpperCase()}</span>
        </div>
        <p className="booking-summary">Existing booking <strong>BK-2048</strong><span aria-hidden="true">·</span> Current date <strong>2026-10-10</strong></p>

        <div className="comparison" aria-label="Mouse and keyboard test comparison">
          <article className="journey-panel">
            <div className="journey-title"><span className="route-dot mouse-dot" aria-hidden="true" />Mouse baseline</div>
            <p>Select a new booking date and confirm the change.</p>
            {run?.result ? (
              <dl className="assertion-list">
                <div><dt>Fresh booking</dt><dd>{run.result.mouse.initialDate}</dd></div>
                <div><dt>Expected date</dt><dd>{run.result.mouse.expectedDate}</dd></div>
                <div><dt>Observed booking</dt><dd>{run.result.mouse.observedDate}</dd></div>
                <div><dt>Independent check</dt><dd className={run.result.mouse.verified ? 'state-pass' : 'state-fail'}>{run.result.mouse.verified ? 'Verified saved' : 'Not verified'}</dd></div>
              </dl>
            ) : <div className="empty-state">Waiting for a real browser run</div>}
          </article>
          <article className="journey-panel">
            <div className="journey-title"><span className="route-dot key-dot" aria-hidden="true" />Keyboard-only</div>
            <p>{(run?.result?.scenarioId ?? scenarioId) === 'alternative'
              ? 'Tab to Enter new date, type YYYY-MM-DD, then Tab to Save new date and press Enter.'
              : (run?.result?.scenarioId ?? scenarioId) === 'fixed'
                ? 'Tab to Confirm Reschedule, then activate with Enter and Space independently.'
                : 'Tab to Confirm Reschedule, then try Enter and Space independently.'}</p>
            {run?.result ? (
              <div className="attempt-list">
                {run.result.keyboard.map((attempt) => (
                  <div className="attempt-row" key={attempt.key}>
                    <span className="keycap">{attempt.key}</span>
                    <span className="attempt-focus">{attempt.key === 'Direct date entry' ? 'Field + Save focused naturally' : attempt.focusedConfirm ? 'Confirm focused naturally' : 'Confirm not focused'}</span>
                    <span className="attempt-state">Start {attempt.initialDate} → observed <strong>{attempt.observedDate}</strong></span>
                    <span className={attempt.completed ? 'state-pass' : attempt.unchanged ? 'state-fail' : 'state-neutral'}>
                      {attempt.completed ? 'Expected date saved' : attempt.unchanged ? 'Unchanged' : 'Completion not verified'}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state">A fresh browser state will be used</div>}
          </article>
        </div>

        <div className="result-bar" role="status" aria-live="polite">
          {!run && <><span className="status-mark neutral" aria-hidden="true">i</span><span>No test has run yet. Start the test to capture actual browser results.</span></>}
          {run?.status === 'running' && <><span className="status-mark active" aria-hidden="true">…</span><span>{progressMessage}</span></>}
          {run?.status === 'passed' && <><span className="status-mark neutral" aria-hidden="true">✓</span><span>Passed: the independent booking-state check verified task completion.</span></>}
          {run?.status === 'confirmed_failure' && <><span className="status-mark failure" aria-hidden="true">!</span><span>Confirmed Failure: mouse saved the date; keyboard activation did not.</span></>}
          {run?.status === 'inconclusive' && <><span className="status-mark active" aria-hidden="true">?</span><span>{run.reason ?? 'Inconclusive — Completion Not Verified. The independent booking-state assertion did not establish task completion.'}</span></>}
          {run?.status === 'test_error' && <><span className="status-mark failure" aria-hidden="true">!</span><span><strong>{run.executionState === 'incomplete' ? 'Test Incomplete · Test Error' : 'Test Error'}</strong><br />{run.reason} This does not prove an accessibility defect.</span></>}
          {run?.status === 'submitting' && <><span className="status-mark active" aria-hidden="true">…</span><span>Submitting the scenario request.</span></>}
        </div>
        {run?.result?.regressionReplay && (
          <p className="replay-summary" role="status">
            Standalone regression replay: broken {run.result.regressionReplay.brokenFailsAsExpected ? 'fails as expected' : 'result unverified'}; fixed {run.result.regressionReplay.fixedPasses ? 'passes' : 'result unverified'}.
          </p>
        )}
        {run && run.status !== 'running' && run.status !== 'submitting' && run.status !== 'passed' && (
          <button className="retry-action" type="button" onClick={startTest}>Retry from clean state</button>
        )}
      </section>

      <section className="timeline-section" aria-labelledby="timeline-title">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">EXECUTION RECORD</p><h2 id="timeline-title">Run timeline</h2></div>
          <span className="timeline-count">{run?.events?.length ?? 0} events</span>
        </div>
        {run?.events?.length ? (
          <ol className="timeline-list">
            {run.events.map((event, index) => (
              <li className="timeline-event" key={`${event.timestamp}-${index}`}>
                <span className="timeline-marker" aria-hidden="true">{index === run.events!.length - 1 ? '●' : '○'}</span>
                <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
                <span className="event-stage">{event.stage.replaceAll('_', ' ')}</span>
                <span className="event-message">{event.message}</span>
              </li>
            ))}
          </ol>
        ) : <p className="timeline-empty">Recorded browser events will appear here after a test runs.</p>}
      </section>

      <section className="evidence-section" id="run-evidence" aria-labelledby="evidence-title">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">AUTHENTIC ARTIFACTS</p><h2 id="evidence-title">Evidence and replay</h2></div>
          {runId && (run?.artifacts?.length ?? 0) > 0 && <a className="download-link" href={`/api/runs/${encodeURIComponent(runId)}/report`}>Download evidence report</a>}
        </div>
        {run?.artifacts?.length ? (
          <>
            <ul className="artifact-list">
              {run.artifacts.map((artifact) => (
                <li key={artifact.id}>
                  <span className="artifact-kind" aria-hidden="true">{artifact.contentType === 'image/png' ? 'IMG' : artifact.contentType === 'application/zip' ? 'ZIP' : artifact.id.endsWith('.log.json') ? 'LOG' : 'TS'}</span>
                  <span className="artifact-name">{artifact.id}</span>
                  <span className="artifact-size">{Math.max(1, Math.round(artifact.size / 1024))} KB</span>
                  {runId && <a href={`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.id)}`} download={artifact.id}>Download</a>}
                </li>
              ))}
            </ul>
            {runId && run.status === 'confirmed_failure' && run.result?.regressionReplay?.brokenFailsAsExpected && run.result.regressionReplay.fixedPasses && (
              <div className="replay-proof"><span className="proof-mark" aria-hidden="true">✓</span><div><strong>Regression replay verified</strong><span>Broken fixture fails · Fixed fixture passes</span></div><a href={`/api/runs/${encodeURIComponent(runId)}/regression-test`} download>Download standalone test</a></div>
            )}
          </>
        ) : <p className="timeline-empty">{run ? 'No supporting evidence was captured for this run.' : 'Screenshots, traces, logs, and reports appear here only after they are captured.'}</p>}
      </section>

      <footer className="footer-note">A valid alternative keyboard route will count as task success.</footer>
    </main>
  );
}