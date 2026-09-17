import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { render } from '../src/render.mjs';
import { runCli } from '../src/cli.mjs';

const mapping = extra => ({ commands: { capability: {
  observe: Object.freeze({ min: 1, max: 1, input: true, observation: true, format: true, offered: true,
    wraps: { operation: 'observe' }, ...extra }) } } });

const cell = (cellId, parentCellId, altitude, semanticAddress, observed) =>
  ({ cellId, parentCellId, altitude, semanticAddress, observed });
const entry = (durationMilliseconds, logicalOrder, disposition = 'completed') =>
  ({ disposition, durationMilliseconds, logicalOrder });

test('the circuit renders semantic boxes, collapses expression cells and keeps the outcome as evidence', () => {
  const overlay = { cells: [
    cell('cell:scenario:example', null, 'scenario',
      { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' }, [entry(12, 4)]),
    cell('cell:mechanic:example.operation.1', 'cell:scenario:example', 'mechanic',
      { scenarioId: 'example', semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'first-port',
        responsibilityKind: 'invoke-port', responsibilityOrdinal: 1 }, [entry(3, 1)]),
    cell('cell:mechanic:example.operation.1:expression', 'cell:mechanic:example.operation.1', 'mechanic',
      { scenarioId: 'example', semanticRole: 'MECHANIC', mechanicId: 'object' }, [entry(2, 2)]),
    cell('cell:provider:example.operation.1', 'cell:mechanic:example.operation.1', 'provider', null, [entry(9, 2, 'failed')]),
    cell('cell:physical:example.operation.1', 'cell:provider:example.operation.1', 'physical', null, []),
    cell('cell:mechanic:example.operation.2', 'cell:scenario:example', 'mechanic',
      { scenarioId: 'example', semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'never-ran-port',
        responsibilityKind: 'invoke-port', responsibilityOrdinal: 2 }, [])
  ] };
  const payload = { capabilityId: 'example', overlay, result: { outcome: { payload: { message: 'Hello, World!' } } } };
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit' }, payload, mapping());
  assert.ok(text.startsWith('CIRCUIT  example'));
  assert.ok(text.includes('SCENARIO  example  ✓  12 ms'));
  assert.ok(text.includes('MECHANIC  first-port  ✓  3 ms'));
  // A failed cell and an unobserved cell are distinct: × is testimony, – is absence.
  assert.ok(text.includes('PROVIDER  ×  9 ms'));
  assert.ok(text.includes('PHYSICAL  –'));
  assert.ok(text.includes('MECHANIC  never-ran-port  –'));
  // The expression sub-cell collapses into its enclosing responsibility.
  assert.ok(!text.includes('object'));
  assert.ok(!text.includes(':expression'));
  assert.ok(text.endsWith('EVIDENCE  {"message":"Hello, World!"}'));
});

test('selection edges render both planned branches: the admitted one lit, the refused one NO EFFECT', () => {
  const overlay = {
    cells: [
      cell('cell:scenario:root', null, 'scenario',
        { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'root' }, [entry(1, 1)]),
      cell('cell:mechanic:root.operation.1', 'cell:scenario:root', 'mechanic',
        { scenarioId: 'root', semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'decide-port',
          responsibilityKind: 'invoke-port', responsibilityOrdinal: 1 }, [entry(1, 2)]),
      cell('cell:scenario:admitted', null, 'scenario',
        { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'admitted-target' }, [entry(5, 4)]),
      cell('cell:scenario:refused', null, 'scenario',
        { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'refused-target' }, [])
    ],
    edges: [
      { edgeId: 'edge:route-root-ADMITTED', kind: 'selection',
        planned: { from: { cellId: 'cell:scenario:root' }, to: { cellId: 'cell:scenario:admitted' }, selectsVariant: 'ADMITTED' },
        observed: [{ admissionDisposition: 'admitted', logicalOrder: 3 }] },
      { edgeId: 'edge:route-root-REFUSED', kind: 'selection',
        planned: { from: { cellId: 'cell:scenario:root' }, to: { cellId: 'cell:scenario:refused' }, selectsVariant: 'REFUSED' },
        observed: [] }
    ]
  };
  const payload = { capabilityId: 'root', overlay, result: { outcome: { payload: { symbol: 'AVGO' } } } };
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit' }, payload, mapping());
  assert.ok(text.includes('► ADMITTED'));
  assert.ok(text.includes('× REFUSED  NO EFFECT'));
  assert.ok(text.includes('SCENARIO  admitted-target  ✓  5 ms'));
  assert.ok(text.includes('SCENARIO  refused-target  –'));
  assert.ok(text.endsWith('EVIDENCE  {"symbol":"AVGO"}'));
});

test('a large graph collapses to scenario-level boxes with child counts', () => {
  const responsibilities = Array.from({ length: 40 }, (_, index) => cell(
    `cell:mechanic:big.operation.${index + 1}`, 'cell:scenario:big', 'mechanic',
    { scenarioId: 'big', semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: `big-port-${index + 1}`,
      responsibilityKind: 'invoke-port', responsibilityOrdinal: index + 1 }, [entry(index, index + 1)]));
  const overlay = { cells: [
    cell('cell:scenario:big', null, 'scenario',
      { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'big' }, [entry(50, 100)]),
    ...responsibilities
  ] };
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit' }, { capabilityId: 'big', overlay }, mapping());
  assert.ok(text.includes('SCENARIO  big  ✓  50 ms  (40 cells)'));
  assert.ok(!text.includes('big-port-1'));
});

test('the circuit format changes no other reading: a payload without an overlay keeps the story', () => {
  const story = { scenario: { scenarioId: 'example', outcomeId: 'result', responsibilities: [] } };
  assert.equal(render({ object: 'capability', verb: 'observe' }, { story }, mapping()),
    'Scenario example\nWHEN\nTHEN\n  ✓ result');
  assert.equal(render({ object: 'capability', verb: 'observe', format: 'circuit' }, { story }, mapping()),
    'Scenario example\nWHEN\nTHEN\n  ✓ result');
  assert.equal(render({ object: 'capability', verb: 'observe', format: 'circuit' },
    { story, display: { document: { documentType: 'sfx-display-document.v1', blocks: [{ type: 'line', text: 'DECLARED STORY' }] }, as: 'text' } }, mapping()),
  'DECLARED STORY');
});

test('--format circuit leaves --json byte-identical', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-circuit-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({
    mappingType: 'sfx-command-mapping.v1',
    identities: { capability: { pattern: '^[a-z][a-z0-9.-]*$', message: 'Supply a capability identity.' } },
    surfaces: { estate: { capabilityId: 'deliver-estate', request: 'estate-request.v1', operations: ['observe'] } },
    commands: { capability: { observe: { min: 1, max: 1, identity: 'capability', input: true, observation: true, format: true,
      wraps: { surface: 'estate', operation: 'observe' } } } }
  }));
  const configFile = path.join(root, 'sfx.config.json');
  await fs.writeFile(configFile, JSON.stringify({ configurationType: 'sfx-project.v1', commands: 'commands.json' }));
  const overlay = { cells: [cell('cell:scenario:example', null, 'scenario',
    { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' }, [entry(5, 1)])] };
  const outcome = { payload: { capabilityId: 'example', overlay, story: { scenario: { scenarioId: 'example' } } } };
  const factory = () => ({ execute: async () => outcome });
  const write = () => { let text = ''; return { stream: { write: value => { text += value; } }, text: () => text }; };
  const stdout = write();
  const streams = { stdout: stdout.stream, stderr: { write: () => {} }, factory };
  const argv = ['capability', 'observe', 'example', '--input', '{}', '--config', configFile];
  assert.equal(await runCli([...argv, '--json'], streams), 0);
  const plain = stdout.text();
  assert.equal(await runCli([...argv, '--json', '--format', 'circuit'], streams), 0);
  // The second run writes onto the same carrier; split it back out and compare.
  const both = stdout.text();
  assert.equal(both.slice(plain.length), plain);
});
