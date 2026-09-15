import test from 'node:test';
import assert from 'node:assert/strict';
import { render, renderObservation } from '../src/render.mjs';

const mapping = { commands: { capability: { observe: Object.freeze({ offered: true, wraps: { operation: 'observe' } }) } } };

test('semantic testimony prints in the declared terms it carries', () => {
  assert.equal(renderObservation({ observedAt: '2026-01-01T00:00:01.250Z', semanticRole: 'EXECUTION_RESPONSIBILITY',
    responsibilityId: 'build-equity-price-binding-request', durationMilliseconds: 12 }),
    '  ✓ 00:00:01.250 build-equity-price-binding-request 12 ms');
  assert.equal(renderObservation({ semanticRole: 'MECHANIC', mechanicId: 'object', responsibilityId: 'first-port',
    durationMilliseconds: 1 }), '  · mechanic object 1 ms');
  assert.equal(renderObservation({ semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example', durationMilliseconds: 1500 }),
    '  ✓ scenario example 1.50 s');
  assert.equal(renderObservation({ semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityKind: 'invoke-scenario',
    childScenarioId: 'child', responsibilityId: 'child' }), '  ✓ scenario child');
  // An edge streams as the admission path into the addressed cell, not as a
  // second cell observation.
  assert.equal(renderObservation({ observationType: 'edge-execution-testimony.v1', edgeId: 'edge:return:say-hello-world',
    semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'say-hello-world', durationMilliseconds: 12 }),
    '  ↳ scenario say-hello-world 12 ms');
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
  // The declared display projection is appended when asked for; the story is not.
  assert.ok(text.includes('"observedPrice": 344.72'));
  const bare = render({ object: 'capability', verb: 'observe' }, { ...payload }, mapping);
  assert.ok(!bare.includes('344.72'));
});
