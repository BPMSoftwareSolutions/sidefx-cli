import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { render, renderCircuitObservation } from '../src/render.mjs';
import { runCli } from '../src/cli.mjs';

const mapping = extra => ({ commands: { capability: {
  observe: Object.freeze({ min: 1, max: 1, input: true, observation: true, format: true, offered: true,
    wraps: { operation: 'observe' }, ...extra }) } } });

const cell = (cellId, parentCellId, altitude, semanticAddress, observed) =>
  ({ cellId, parentCellId, altitude, semanticAddress, observed });
const entry = (durationMilliseconds, logicalOrder, disposition = 'completed') =>
  ({ disposition, durationMilliseconds, logicalOrder });
const scenarioEvent = (scenarioId, durationMilliseconds, status = 'completed') => ({
  observationType: 'cell-execution-testimony.v1', cellId: `cell:scenario:${scenarioId}`, cellAltitude: 'scenario',
  scenarioId, semanticRole: 'SCENARIO_OUTCOME', durationMilliseconds,
  display: { entry: { status, text: `scenario ${scenarioId}`, timing: `${durationMilliseconds} ms` } }
});

async function project(t) {
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
  return configFile;
}

const carrier = () => { let text = ''; return { stream: { write: value => { text += value; } }, text: () => text }; };

const branchOverlay = () => ({
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
});
const branchPayload = () => ({ capabilityId: 'root', overlay: branchOverlay(), result: { outcome: { payload: { symbol: 'AVGO' } } } });

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
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit' }, branchPayload(), mapping());
  assert.ok(text.includes('► ADMITTED'));
  assert.ok(text.includes('× REFUSED  NO EFFECT'));
  assert.ok(text.includes('SCENARIO  admitted-target  ✓  5 ms'));
  assert.ok(text.includes('SCENARIO  refused-target  –'));
  assert.ok(text.endsWith('EVIDENCE  {"symbol":"AVGO"}'));
});

test('the streamed closing frame prints only the selection branches and the evidence', () => {
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit', streamedCircuit: true },
    branchPayload(), mapping());
  assert.ok(text.includes('BRANCH  root'));
  assert.ok(text.includes('► ADMITTED'));
  assert.ok(text.includes('× REFUSED  NO EFFECT'));
  assert.ok(text.includes('admitted-target'));
  assert.ok(text.includes('refused-target'));
  // The observed component boxes already streamed; the frame never repeats them.
  assert.ok(!text.includes('SCENARIO  '));
  assert.ok(!text.includes('MECHANIC  '));
  assert.ok(text.endsWith('EVIDENCE  {"symbol":"AVGO"}'));
});

test('the circuit stream prints one box per arrived semantic component, in arrival order, and skips sub-cells', () => {
  const state = {};
  const first = renderCircuitObservation(scenarioEvent('first', 4), state);
  assert.equal(first.split('\n').length, 3);
  assert.ok(first.includes('SCENARIO  first  ✓  4 ms'));
  // An expression sub-cell belongs to its enclosing component: nothing prints.
  assert.equal(renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:mechanic:first.operation.1:expression.fields.x', cellAltitude: 'mechanic', durationMilliseconds: 1,
    display: { entry: { status: 'completed', text: 'literal x' } } }, state), '');
  // An edge entry is an admission path, not a component.
  assert.equal(renderCircuitObservation({ observationType: 'edge-execution-testimony.v1',
    edgeId: 'edge:return:first', destinationCellId: 'cell:scenario:first', admissionDisposition: 'admitted' }, state), '');
  const second = renderCircuitObservation(scenarioEvent('second', 6000, 'failed'), state);
  assert.ok(second.startsWith(' '));
  assert.ok(second.includes('▼'));
  assert.ok(second.includes('SCENARIO  second  ×  6.00 s'));
  // The declared outcome classification settles the glyph before the mechanical
  // disposition: a classified failure inside a completed cell is an ×.
  const classified = renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:provider:first.operation.1', cellAltitude: 'provider', durationMilliseconds: 2,
    disposition: 'completed', outcomeClassification: 'failure' }, state);
  assert.ok(classified.includes('PROVIDER  ×  2 ms'));
  // With no status-bearing field at all the component is unobserved, never failed.
  const absent = renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:physical:first.operation.1', cellAltitude: 'physical' }, state);
  assert.ok(absent.includes('PHYSICAL  –'));
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

test('a circuit observe streams boxes to stdout in arrival order and never renders the story trace', async t => {
  const configFile = await project(t);
  const arrived = [];
  const outcome = { payload: { capabilityId: 'example', overlay: {
    cells: [
      cell('cell:scenario:first', null, 'scenario', { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'first' }, [entry(4, 1)]),
      cell('cell:scenario:admitted', null, 'scenario', { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'admitted' }, [entry(5, 4)]),
      cell('cell:scenario:refused', null, 'scenario', { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'refused' }, [])
    ],
    edges: [
      { edgeId: 'edge:route-first-ADMITTED', kind: 'selection',
        planned: { from: { cellId: 'cell:scenario:first' }, to: { cellId: 'cell:scenario:admitted' }, selectsVariant: 'ADMITTED' },
        observed: [{ admissionDisposition: 'admitted', logicalOrder: 3 }] },
      { edgeId: 'edge:route-first-REFUSED', kind: 'selection',
        planned: { from: { cellId: 'cell:scenario:first' }, to: { cellId: 'cell:scenario:refused' }, selectsVariant: 'REFUSED' },
        observed: [] }
    ] }, result: { outcome: { payload: { symbol: 'AVGO' } } },
    story: { scenario: { scenarioId: 'example', outcomeId: 'result', responsibilities: [] } } } };
  const factory = () => ({ execute: async (request, { onObservation } = {}) => {
    for (const event of [scenarioEvent('first', 4), scenarioEvent('admitted', 5)]) {
      arrived.push(event.cellId);
      onObservation?.(event);
    }
    return outcome;
  } });
  const stdout = carrier();
  const stderr = carrier();
  const argv = ['capability', 'observe', 'example', '--input', '{}', '--format', 'circuit', '--config', configFile];
  assert.equal(await runCli(argv, { stdout: stdout.stream, stderr: stderr.stream, factory }), 0);
  const text = stdout.text();
  assert.deepEqual(arrived, ['cell:scenario:first', 'cell:scenario:admitted']);
  assert.ok(text.startsWith('CIRCUIT  example\n'));
  assert.ok(text.indexOf('SCENARIO  first  ✓  4 ms') > 0);
  assert.ok(text.indexOf('SCENARIO  admitted  ✓  5 ms') > text.indexOf('SCENARIO  first'));
  assert.ok(text.includes('BRANCH  first'));
  assert.ok(text.includes('► ADMITTED'));
  assert.ok(text.includes('× REFUSED  NO EFFECT'));
  assert.ok(text.includes('refused'));
  assert.ok(text.endsWith('EVIDENCE  {"symbol":"AVGO"}\n'));
  // The streamed circuit replaces the story stream: no story lines, no span line.
  assert.ok(!text.includes('Scenario example'));
  assert.ok(!text.includes('Σ'));
  assert.equal(stderr.text(), '');
});

test('--format circuit leaves --json byte-identical', async t => {
  const configFile = await project(t);
  const overlay = { cells: [cell('cell:scenario:example', null, 'scenario',
    { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' }, [entry(5, 1)])] };
  const outcome = { payload: { capabilityId: 'example', overlay, story: { scenario: { scenarioId: 'example' } } } };
  const factory = () => ({ execute: async () => outcome });
  const stdout = carrier();
  const streams = { stdout: stdout.stream, stderr: { write: () => {} }, factory };
  const argv = ['capability', 'observe', 'example', '--input', '{}', '--config', configFile];
  assert.equal(await runCli([...argv, '--json'], streams), 0);
  const plain = stdout.text();
  assert.equal(await runCli([...argv, '--json', '--format', 'circuit'], streams), 0);
  // The second run writes onto the same carrier; split it back out and compare.
  const both = stdout.text();
  assert.equal(both.slice(plain.length), plain);
});
