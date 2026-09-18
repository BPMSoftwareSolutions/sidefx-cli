import test from 'node:test';
import assert from 'node:assert/strict';
import { render, renderObservation } from '../src/render.mjs';

const mapping = { commands: { capability: { observe: Object.freeze({ offered: true, wraps: { operation: 'observe' } }) } } };

test('semantic testimony prints in the declared terms it carries', () => {
  assert.equal(renderObservation({ observedAt: '2026-01-01T00:00:01.250Z', semanticRole: 'EXECUTION_RESPONSIBILITY',
    responsibilityId: 'build-equity-price-binding-request', durationMilliseconds: 12 }),
    '  ✓ 00:00:01.250 build-equity-price-binding-request 12 ms');
  assert.equal(renderObservation({ semanticRole: 'MECHANIC', mechanicId: 'object', responsibilityId: 'first-port',
    durationMilliseconds: 1 }), '  · object 1 ms');
  // A mechanic carries the declared expression path it computed, so repeated
  // mechanics are distinguishable in the trace.
  assert.equal(renderObservation({ semanticRole: 'MECHANIC', mechanicId: 'literal', mechanicPath: 'requestUrl.symbol',
    durationMilliseconds: 1 }), '  · literal requestUrl.symbol 1 ms');
  assert.equal(renderObservation({ semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example', durationMilliseconds: 1500 }),
    '  ✓ scenario example 1.50 s');
  assert.equal(renderObservation({ semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityKind: 'invoke-scenario',
    childScenarioId: 'child', responsibilityId: 'child' }), '  ✓ scenario child');
  // An edge streams as the admission path into the addressed cell, not as a
  // second cell observation.
  assert.equal(renderObservation({ observationType: 'edge-execution-testimony.v1', edgeId: 'edge:return:say-hello-world',
    semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'say-hello-world', durationMilliseconds: 12 }),
    '  ↳ scenario say-hello-world 12 ms');
  assert.equal(renderObservation({ observationType: 'edge-execution-testimony.v1', edgeId: 'edge:1',
    semanticRole: 'MECHANIC', mechanicId: 'literal', mechanicPath: 'requestUrl.symbol',
    admissionDisposition: 'admitted', durationMilliseconds: 2 }),
    '  ↳ literal requestUrl.symbol admitted 2 ms');
});

test('an observation without an address keeps the mechanical line and its allowlist', () => {
  const line = renderObservation({ observedAt: '2026-01-01T00:00:01.250Z', observationType: 'cell-execution-testimony.v1',
    phase: 'executeDeclaredGraph', scenarioId: 'root', sequence: 2, status: 'observed', input: { secret: 1 } });
  assert.equal(line, '  . 00:00:01.250 cell-execution-testimony.v1 executeDeclaredGraph #2 observed');
  assert.equal(renderObservation({ observationType: 'delivery-phase' }, true),
    JSON.stringify({ observation: { observationType: 'delivery-phase' } }));
});

test('the observed story renders declared faces, ordered responsibilities and composed scenarios', () => {
  const story = {
    scenario: { scenarioId: 'resolve-equity-market-price-evidence', inputId: 'live-equity-price-request',
      inputContractId: 'live-equity-price-request.v1', outcomeId: 'equity-market-price-evidence',
      outcomeContractId: 'equity-market-price-evidence.v1', responsibilities: [
        { responsibilityId: 'build-equity-price-binding-request', disposition: 'completed', durationMilliseconds: 4 },
        { responsibilityId: 'bind-equity-price-provider-credential', disposition: 'completed', durationMilliseconds: 369 }] },
    composedScenarios: [{ scenarioId: 'child-scenario', parentScenarioId: 'resolve-equity-market-price-evidence',
      responsibilities: [{ responsibilityId: 'child-port', disposition: 'failed', durationMilliseconds: 2 }] }]
  };
  const payload = { story, result: { outcome: { payload: { observedPrice: 344.72 } } },
    display: { select: 'outcome.payload', as: 'json' } };
  const text = render({ object: 'capability', verb: 'observe', display: true }, payload, mapping);
  const lines = text.split('\n');
  assert.equal(lines[0], 'Scenario resolve-equity-market-price-evidence');
  assert.equal(lines[1], 'GIVEN live-equity-price-request  (live-equity-price-request.v1)');
  assert.equal(lines[2], 'WHEN');
  assert.equal(lines[3], '  ✓ build-equity-price-binding-request  4 ms');
  assert.equal(lines[4], '  ✓ bind-equity-price-provider-credential  369 ms');
  assert.equal(lines[5], 'THEN');
  assert.equal(lines[6], '  ✓ equity-market-price-evidence  (equity-market-price-evidence.v1)');
  assert.ok(text.includes('Scenario child-scenario  under resolve-equity-market-price-evidence'));
  assert.ok(text.includes('  × child-port  2 ms'));
  // The declared display reading is always appended to the observed story: the
  // capability declares its outcome reading, and observation renders it. The
  // `--display` flag remains the invoke-side ask and changes nothing here.
  assert.ok(text.includes('"observedPrice": 344.72'));
  const bare = render({ object: 'capability', verb: 'observe' }, { ...payload }, mapping);
  assert.ok(bare.includes('"observedPrice": 344.72'));
  assert.ok(bare.includes('Scenario resolve-equity-market-price-evidence'));
});

test('reveal emits the declared reader document and selects markdown by declared format', () => {
  const payload = {
    capabilityId: 'resolve-equity-market-price-evidence', view: 'meaning',
    evidence: { snapshotId: 'sha256:snapshot' },
    display: { as: 'text', document: { documentType: 'sfx-display-document.v1', blocks: [
      { type: 'line', text: 'Capability  resolve-equity-market-price-evidence' },
      { type: 'line', text: 'Root        resolve-equity-market-price-evidence' },
      { type: 'line', text: 'Snapshot    sha256:snapshot' },
      { type: 'heading', text: 'Canonical feature' },
      { type: 'line', text: '  Feature: Resolve provider-neutral equity market-price evidence' },
      { type: 'heading', text: 'Execution plan (1)' },
      { type: 'line', text: '    invoke-port -> build-equity-price-binding-request' }
    ] } }
  };
  const mapping = { commands: { capability: { reveal: Object.freeze({ offered: true, wraps: { operation: 'reveal' } }) } } };
  const text = render({ object: 'capability', verb: 'reveal' }, payload, mapping);
  assert.ok(text.includes('Capability  resolve-equity-market-price-evidence'));
  assert.ok(text.includes('Root        resolve-equity-market-price-evidence'));
  assert.ok(text.includes('Snapshot    sha256:snapshot'));
  assert.ok(text.includes('Canonical feature\n-----------------'));
  assert.ok(text.includes('Given') === false);
  assert.ok(text.includes('    invoke-port -> build-equity-price-binding-request'));
  // Markdown is the same declared document in a review-ready heading style.
  const markdown = render({ object: 'capability', verb: 'reveal', format: 'markdown' }, payload, mapping);
  assert.ok(markdown.includes('## Canonical feature'));
  assert.ok(markdown.includes('## Execution plan (1)'));
  // A reader payload without a declared document is shown verbatim: the
  // terminal composes no reader reading of its own.
  const undeclared = render({ object: 'capability', verb: 'reveal' },
    { capabilityId: 'example', meaning: { graphSource: {} } }, mapping);
  assert.equal(undeclared, JSON.stringify({ capabilityId: 'example', meaning: { graphSource: {} } }, null, 2));
});

test('--trace keeps the mechanical depth: the story first, then the observed tree', () => {
  const story = { scenario: { scenarioId: 'example', outcomeId: 'result', responsibilities: [] } };
  const overlay = { cells: [
    { cellId: 'cell:scenario:example', parentCellId: null,
      semanticAddress: { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' },
      observed: [{ disposition: 'completed', durationMilliseconds: 5, logicalOrder: 4 }] },
    { cellId: 'cell:mechanic:example.operation.1', parentCellId: 'cell:scenario:example',
      semanticAddress: { semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'first-port' },
      observed: [{ disposition: 'completed', durationMilliseconds: 4, logicalOrder: 2 }] },
    { cellId: 'cell:mechanic:example.operation.1:expression', parentCellId: 'cell:mechanic:example.operation.1',
      semanticAddress: { semanticRole: 'MECHANIC', mechanicId: 'object', mechanicPath: 'payload' },
      observed: [{ disposition: 'completed', durationMilliseconds: 1, logicalOrder: 1 }] }
  ] };
  const payload = { story, overlay, display: { select: 'outcome.payload', as: 'json' },
    result: { outcome: { payload: { observedPrice: 344.72 } } } };
  const text = render({ object: 'capability', verb: 'observe', trace: true }, payload, mapping);
  assert.ok(text.includes('TRACE'));
  // The reading order is the declared one: story, declared reading, trace.
  assert.ok(text.indexOf('"observedPrice": 344.72') < text.indexOf('TRACE'));
  assert.ok(text.includes('✓ scenario example  5 ms'));
  assert.ok(text.includes('  ✓ first-port  4 ms'));
  assert.ok(text.includes('    ✓ object payload  1 ms'));
  // The trace is the --trace reading; the default story does not carry it.
  assert.ok(!render({ object: 'capability', verb: 'observe' }, { story, overlay }, mapping).includes('TRACE'));
});
