import { useState } from 'react';

type RunResult = {
  status: 'submitting' | 'running' | 'passed' | 'confirmed_failure' | 'inconclusive' | 'test_error';
  reason?: string;
  result?: {
    scenarioId: 'broken' | 'fixed' | 'alternative';
    status: 'passed' | 'confirmed_failure' | 'inconclusive';
    mouse: { expectedDate: string; observedDate: string; verified: boolean };
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

export function App() {
  const [run, setRun] = useState<RunResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('broken');

  async function startTest() {
    setStarting(true);
    setRun({ status: 'submitting' });
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
      setRun({ status: 'running' });
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
              <div className="observed-state">
                <span>Booking state observed</span>
                <strong>{run.result.mouse.observedDate}</strong>
                <span className={run.result.mouse.verified ? 'state-pass' : 'state-fail'}>
                  {run.result.mouse.verified ? '✓ Expected date saved' : '× Expected date not saved'}
                </span>
              </div>
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
                    <span>{attempt.key === 'Direct date entry' ? 'Focused field and save action' : attempt.focusedConfirm ? 'Focused confirm' : 'Confirm not focused'}</span>
                    <strong>{attempt.observedDate}</strong>
                    <span className={attempt.unchanged ? 'state-fail' : 'state-pass'}>
                      {attempt.unchanged ? 'Not saved' : 'Saved'}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state">A fresh browser state will be used</div>}
          </article>
        </div>

        <div className="result-bar" role="status" aria-live="polite">
          {!run && <><span className="status-mark neutral" aria-hidden="true">i</span><span>No test has run yet. Start the test to capture actual browser results.</span></>}
          {run?.status === 'running' && <><span className="status-mark active" aria-hidden="true">…</span><span>Playwright is executing real mouse and keyboard journeys.</span></>}
          {run?.status === 'passed' && <><span className="status-mark neutral" aria-hidden="true">✓</span><span>Passed: the independent booking-state check verified task completion.</span></>}
          {run?.status === 'confirmed_failure' && <><span className="status-mark failure" aria-hidden="true">!</span><span>Confirmed Failure: mouse saved the date; keyboard activation did not.</span></>}
          {run?.status === 'inconclusive' && <><span className="status-mark active" aria-hidden="true">?</span><span>Inconclusive: the browser evidence does not establish the task outcome.</span></>}
          {run?.status === 'test_error' && <><span className="status-mark failure" aria-hidden="true">!</span><span>Test Error: {run.reason}</span></>}
          {run?.status === 'submitting' && <><span className="status-mark active" aria-hidden="true">…</span><span>Submitting the scenario request.</span></>}
        </div>
        {run?.result?.regressionReplay && (
          <p className="replay-summary" role="status">
            Standalone regression replay: broken {run.result.regressionReplay.brokenFailsAsExpected ? 'fails as expected' : 'result unverified'}; fixed {run.result.regressionReplay.fixedPasses ? 'passes' : 'result unverified'}.
          </p>
        )}
      </section>

      <footer className="footer-note">A valid alternative keyboard route will count as task success.</footer>
    </main>
  );
}