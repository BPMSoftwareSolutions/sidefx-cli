import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStreamClock, formatGap, renderObservation } from '../src/render.mjs';
import { runCli } from '../src/cli.mjs';

const at = clock => `2026-01-01T00:00:${clock}Z`;

test('a gap is human-scaled: ms under a second, s with two decimals above', () => {
  assert.equal(formatGap(250), '(+250 ms)');
  assert.equal(formatGap(999), '(+999 ms)');
  assert.equal(formatGap(1000), '(+1.00 s)');
  assert.equal(formatGap(6170), '(+6.17 s)');
  assert.equal(formatGap(0), '(+0 ms)');
  // A clock that steps backwards is marked, not hidden.
  assert.equal(formatGap(-50), '(-50 ms)');
  assert.equal(formatGap(-1234), '(-1.23 s)');
});

test('an entry without a usable time renders no gap', () => {
  assert.equal(formatGap(undefined), '');
  assert.equal(formatGap(null), '');
  assert.equal(formatGap(Number.NaN), '');
  assert.equal(formatGap('500'), '');
});

test('the stream clock skips the first entry and measures consecutive event times', () => {
  const clock = createStreamClock();
  assert.equal(clock.gap({ observedAt: at('10.100') }), '');
  assert.equal(clock.gap({ observedAt: at('10.350') }), '(+250 ms)');
  assert.equal(clock.gap({ observedAt: at('16.350') }), '(+6.00 s)');
  assert.equal(clock.total(), '6.25 s');
});

test('the stream clock measures from the time the event actually carries', () => {
  const clock = createStreamClock();
  // The stream time wins; the testimony times are the declared fallback.
  assert.equal(clock.gap({ observedAt: at('10.100'), completedAt: at('10.900') }), '');
  assert.equal(clock.gap({ startedAt: at('10.400'), completedAt: at('10.600') }), '(+500 ms)');
  assert.equal(clock.gap({ observedAt: at('11.100') }), '(+500 ms)');
  assert.equal(clock.total(), '1.00 s');
});

test('a missing time renders no gap and does not disturb the running clock', () => {
  const clock = createStreamClock();
  assert.equal(clock.gap({ observedAt: at('10.100') }), '');
  assert.equal(clock.gap({ phase: 'untimed' }), '');
  assert.equal(clock.gap({ observedAt: 'not-a-time' }), '');
  assert.equal(clock.gap({ observedAt: at('10.600') }), '(+500 ms)');
  assert.equal(clock.total(), '500 ms');
  // One timed entry has no span yet.
  const single = createStreamClock();
  single.gap({ observedAt: at('10.100') });
  assert.equal(single.total(), '');
});

test('a backwards clock is visible in the entry gap and the total span', () => {
  const clock = createStreamClock();
  assert.equal(clock.gap({ observedAt: at('10.500') }), '');
  assert.equal(clock.gap({ observedAt: at('10.250') }), '(-250 ms)');
  assert.equal(clock.total(), '-250 ms');
});

test('the gap annotation appends to the human entry and never to machine output', () => {
  const event = { observedAt: at('01.250'), semanticRole: 'EXECUTION_RESPONSIBILITY',
    responsibilityId: 'project-model-response-policy-to-provider-protocol', durationMilliseconds: 0.06 };
  assert.equal(renderObservation(event, false, '(+6.17 s)'),
    '  ✓ 00:00:01.250 project-model-response-policy-to-provider-protocol 0.06 ms (+6.17 s)');
  assert.equal(renderObservation({ observedAt: at('01.250'),
    display: { entry: { status: 'completed', text: 'say-hello-world-port', timing: '0.046 ms' } } },
  false, '(+250 ms)'), '  ✓ 00:00:01.250 say-hello-world-port  0.046 ms (+250 ms)');
  // Without an annotation the entry bytes are exactly what they were.
  assert.equal(renderObservation(event), '  ✓ 00:00:01.250 project-model-response-policy-to-provider-protocol 0.06 ms');
  assert.equal(renderObservation(event, true, '(+6.17 s)'), JSON.stringify({ observation: event }));
});

async function gapRun(t, events) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-gap-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({
    mappingType: 'sfx-command-mapping.v1',
    identities: { capability: { pattern: '^[a-z][a-z0-9.-]*$', message: 'Supply a capability identity.' } },
    surfaces: { estate: { capabilityId: 'deliver-estate', request: 'estate-request.v1', operations: ['observe'] } },
    commands: { capability: { observe: { min: 1, max: 1, identity: 'capability', input: true, observation: true,
      wraps: { surface: 'estate', operation: 'observe' } } } }
  }));
  const configFile = path.join(root, 'sfx.config.json');
  await fs.writeFile(configFile, JSON.stringify({ configurationType: 'sfx-project.v1', commands: 'commands.json' }));
  const factory = () => ({ execute: async (request, { onObservation } = {}) => {
    for (const event of events) onObservation?.(event);
    return { story: { scenario: { scenarioId: 'example' } } };
  } });
  const streams = { stdout: '', stderr: '' };
  const io = { stdout: { write: value => { streams.stdout += value; } },
    stderr: { write: value => { streams.stderr += value; } }, factory };
  const argv = ['capability', 'observe', 'example', '--input', '{}', '--config', configFile];
  return { argv, io, streams };
}

test('the story stream prints the gap per entry and the total span at completion', async t => {
  const events = [
    { observationType: 'delivery-phase', phase: 'readExecutionDelivery', status: 'started', observedAt: at('10.100') },
    { observationType: 'delivery-phase', phase: 'readExecutionDelivery', status: 'completed', observedAt: at('10.350') },
    { semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'project-model-response-policy-to-provider-protocol',
      durationMilliseconds: 0.06, observedAt: at('10.410') },
    { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'admitted-execution', durationMilliseconds: 83, observedAt: at('15.430') }
  ];
  const { argv, io, streams } = await gapRun(t, events);
  assert.equal(await runCli(argv, io), 0);
  const expected = [
    '  . 00:00:10.100 delivery-phase readExecutionDelivery started',
    '  . 00:00:10.350 delivery-phase readExecutionDelivery completed (+250 ms)',
    '  ✓ 00:00:10.410 project-model-response-policy-to-provider-protocol 0.06 ms (+60 ms)',
    '  ✓ 00:00:15.430 scenario admitted-execution 83 ms (+5.02 s)',
    '  Σ streamed span 5.33 s',
    ''
  ].join('\n');
  assert.equal(streams.stderr, expected);
  // The delivered story on stdout is unchanged; the gaps live in the stream.
  assert.equal(streams.stdout, 'Scenario example\nWHEN\nTHEN\n  ✓ example\n');
  // --trace changes the stream's scope, not its gap display: the same entries
  // are annotated in the same bytes.
  streams.stdout = ''; streams.stderr = '';
  assert.equal(await runCli([...argv, '--trace'], io), 0);
  assert.equal(streams.stderr, expected);
});

test('--json keeps the machine stream exactly as delivered: no gaps, no span line', async t => {
  const events = [
    { observationType: 'delivery-phase', phase: 'readExecutionDelivery', status: 'started', observedAt: at('10.100') },
    { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'admitted-execution', durationMilliseconds: 83, observedAt: at('15.430') }
  ];
  const { argv, io, streams } = await gapRun(t, events);
  assert.equal(await runCli([...argv, '--json'], io), 0);
  assert.equal(streams.stderr, events.map(event => `${JSON.stringify({ observation: event })}\n`).join(''));
  assert.deepEqual(JSON.parse(streams.stdout), { story: { scenario: { scenarioId: 'example' } } });
});
