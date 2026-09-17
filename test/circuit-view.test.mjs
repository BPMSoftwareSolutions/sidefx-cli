import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { render, renderCircuitObservation } from '../src/render.mjs';
import { runCli } from '../src/cli.mjs';
import { SidefxError } from '../src/errors.mjs';

const mapping = extra => ({ commands: { capability: {
  observe: Object.freeze({ min: 1, max: 1, input: true, observation: true, format: true, offered: true,
    wraps: { operation: 'observe' }, ...extra }) } } });

// The declared policy fixture. Every metric, glyph and connector the emitter
// interprets comes from here; the emitter carries no built-in values.
const policy = () => ({
  policyType: 'circuit-presentation.v1',
  box: { minColumns: 20, maxColumns: 40, minRows: 2, align: 'center', wrap: 'hyphen-preferred' },
  glyphs: { success: '✓', failure: '×', unobserved: '–', arrow: '▼', fork: '┬', rail: '│' },
  statusRow: { enabled: true, format: 'glyph duration' },
  labels: { prefixes: { scenario: 'SCENARIO', mechanic: 'MECHANIC', provider: 'PROVIDER', physical: 'PHYSICAL' } },
  granularity: { detailCellLimit: 30 },
  connectors: { rail: '│', arrow: '▼', fork: '┬', labelAbove: true },
  layout: { stableIndent: true }
});

// A stub policy with different metrics, glyphs, prefixes and connectors: the
// emitted output must change with it (policy-driven behavior).
const stubPolicy = () => ({
  policyType: 'circuit-presentation.v1',
  box: { minColumns: 24, maxColumns: 64, minRows: 2, align: 'center', wrap: 'hyphen-preferred' },
  glyphs: { success: 'OK', failure: 'ERR', unobserved: '?', arrow: 'v', fork: '+', rail: '|' },
  statusRow: { enabled: true, format: 'glyph duration' },
  labels: { prefixes: { scenario: 'S', mechanic: 'M', provider: 'P', physical: 'F' } },
  granularity: { detailCellLimit: 5 },
  connectors: { rail: '|', arrow: 'v', fork: '+', labelAbove: false },
  layout: { stableIndent: false }
});

const cell = (cellId, parentCellId, altitude, semanticAddress, observed) =>
  ({ cellId, parentCellId, altitude, semanticAddress, observed });
const entry = (durationMilliseconds, logicalOrder, outcomeClassification = 'success') =>
  ({ outcomeClassification, durationMilliseconds, logicalOrder });
const scenarioEvent = (scenarioId, durationMilliseconds, entryStatus = 'completed') => ({
  observationType: 'cell-execution-testimony.v1', cellId: `cell:scenario:${scenarioId}`, cellAltitude: 'scenario',
  scenarioId, semanticRole: 'SCENARIO_OUTCOME', durationMilliseconds,
  display: { entry: { status: entryStatus, text: `scenario ${scenarioId}`, timing: `${durationMilliseconds} ms` } }
});

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-circuit-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({
    mappingType: 'sfx-command-mapping.v1',
    identities: { capability: { pattern: '^[a-z][a-z0-9.-]*$', message: 'Supply a capability identity.' } },
    surfaces: { estate: { capabilityId: 'deliver-estate', request: 'estate-request.v1', operations: ['observe', 'invoke'] } },
    commands: { capability: {
      observe: { min: 1, max: 1, identity: 'capability', input: true, observation: true, format: true,
        wraps: { surface: 'estate', operation: 'observe' } },
      invoke: { min: 1, max: 1, identity: 'capability', input: true, inputType: true,
        wraps: { surface: 'estate', operation: 'invoke' } }
    } }
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
    cell('cell:provider:example.operation.1', 'cell:mechanic:example.operation.1', 'provider', null, [entry(9, 2, 'failure')]),
    cell('cell:physical:example.operation.1', 'cell:provider:example.operation.1', 'physical', null, []),
    cell('cell:mechanic:example.operation.2', 'cell:scenario:example', 'mechanic',
      { scenarioId: 'example', semanticRole: 'EXECUTION_RESPONSIBILITY', responsibilityId: 'never-ran-port',
        responsibilityKind: 'invoke-port', responsibilityOrdinal: 2 }, [])
  ] };
  const payload = { capabilityId: 'example', overlay, result: { outcome: { payload: { message: 'Hello, World!' } } } };
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit', presentation: policy() }, payload, mapping());
  assert.ok(text.startsWith('CIRCUIT  example'));
  // Label and status are separate centered rows; the label wraps inside the
  // minimum width and the status row carries the declared glyph with the
  // duration verbatim.
  assert.ok(text.includes('SCENARIO  example'));
  assert.ok(text.includes('✓ 12 ms'));
  assert.ok(text.includes('│ MECHANIC  first-port │'), text);
  assert.ok(text.includes('✓ 3 ms'));
  // A failed cell and an unobserved cell are distinct: × is testimony, – is absence.
  assert.ok(text.includes('PROVIDER'));
  assert.ok(text.includes('× 9 ms'));
  assert.ok(text.includes('PHYSICAL'));
  assert.ok(text.includes('–'));
  assert.ok(text.includes('never-ran-port'));
  // The expression sub-cell collapses into its enclosing responsibility.
  assert.ok(!text.includes('object'));
  assert.ok(!text.includes(':expression'));
  assert.ok(text.endsWith('EVIDENCE  {"message":"Hello, World!"}'));
});

test('selection edges render both planned branches: the admitted one lit, the refused one NO EFFECT', () => {
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit', presentation: policy() }, branchPayload(), mapping());
  assert.ok(text.includes('► ADMITTED'));
  assert.ok(text.includes('× REFUSED  NO EFFECT'));
  assert.ok(text.includes('admitted-target'));
  assert.ok(text.includes('✓ 5 ms'));
  assert.ok(text.includes('refused-target'));
  assert.ok(text.includes('–'));
  assert.ok(text.endsWith('EVIDENCE  {"symbol":"AVGO"}'));
});

test('the streamed closing frame prints only the selection branches and the evidence', () => {
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit', streamedCircuit: true, presentation: policy() },
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
  const state = { policy: policy() };
  const first = renderCircuitObservation(scenarioEvent('first', 4), state);
  assert.equal(first.split('\n').length, 4);
  assert.ok(first.split('\n').includes('│  SCENARIO  first   │'));
  assert.ok(first.split('\n').includes('│       ✓ 4 ms       │'));
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
  assert.ok(second.includes('SCENARIO  second'));
  assert.ok(second.includes('× 6.00 s'));
  // The declared outcome classification settles the glyph before the declared
  // display entry: a classified failure inside a completed entry is an ×.
  const classified = renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:provider:first.operation.1', cellAltitude: 'provider', durationMilliseconds: 2,
    outcomeClassification: 'failure', display: { entry: { status: 'completed' } } }, state);
  assert.ok(classified.includes('PROVIDER'));
  assert.ok(classified.includes('× 2 ms'));
  // The estate's declared display-entry status is the stream's classification
  // token (completed/failed); the mechanical disposition is not classification
  // and never lights or fails a box.
  const declared = renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:provider:second.operation.1', cellAltitude: 'provider', durationMilliseconds: 2,
    display: { entry: { status: 'completed' } } }, state);
  assert.ok(declared.includes('✓ 2 ms'));
  const absent = renderCircuitObservation({ observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:physical:first.operation.1', cellAltitude: 'physical',
    disposition: 'completed' }, state);
  assert.ok(absent.includes('PHYSICAL'));
  assert.ok(absent.includes('–'));
  assert.ok(!absent.includes('✓'));
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
  const text = render({ object: 'capability', verb: 'observe', format: 'circuit', presentation: policy() },
    { capabilityId: 'big', overlay }, mapping());
  assert.ok(text.includes('(40 cells)'));
  assert.ok(text.includes('✓ 50 ms'));
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

test('the circuit geometry is interpreted from the policy: a stub policy changes every metric and glyph', () => {
  const long = 'cell:mechanic:example.operation.1';
  const overlay = { cells: [
    cell('cell:scenario:example', null, 'scenario',
      { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' }, [entry(12, 4)]),
    cell(long, 'cell:scenario:example', 'mechanic',
      { scenarioId: 'example', semanticRole: 'EXECUTION_RESPONSIBILITY',
        responsibilityId: 'a-very-long-responsibility-identifier-forced-to-wrap',
        responsibilityKind: 'invoke-port', responsibilityOrdinal: 1 }, [entry(3, 1)]),
    cell('cell:provider:example.operation.1', 'cell:mechanic:example.operation.1', 'provider', null, [entry(9, 9, 'failure')])
  ] };
  const payload = { capabilityId: 'example', overlay };
  const declared = render({ object: 'capability', verb: 'observe', format: 'circuit', presentation: policy() }, payload, mapping());
  const stub = render({ object: 'capability', verb: 'observe', format: 'circuit', presentation: stubPolicy() }, payload, mapping());
  assert.notEqual(declared, stub);
  // Declared: bars never exceed the declared maximum (40), labels never exceed
  // its text limit (38), the hyphen-preferred wrap breaks the long id.
  for (const line of declared.split('\n')) assert.ok(line.length <= 42, `${line.length}: ${line}`);
  assert.ok(declared.includes('a-very-long-responsibility-identifier-'));
  assert.ok(declared.includes('│ SCENARIO  example  │'), declared);
  assert.ok(declared.includes('SCENARIO  example'));
  assert.ok(declared.includes('✓ 12 ms'));
  assert.ok(declared.includes('× 9 ms'));
  // Stub: its own columns, prefixes, glyphs and connectors.
  for (const line of stub.split('\n')) assert.ok(line.length <= 66, `${line.length}: ${line}`);
  assert.ok(stub.includes('S  example') || stub.includes('S  example  '));
  assert.ok(stub.includes('OK 12 ms'));
  assert.ok(stub.includes('ERR 9 ms'));
  assert.ok(stub.includes('M  a-very-long-responsibility-identifier-forced-to-wrap')
    || stub.includes('a-very-long-responsibility-identifier-forced-to-wrap'));
  assert.ok(!stub.includes('SCENARIO'));
  assert.ok(!stub.includes('✓'));
  // The stub's rail/arrow replace the declared connectors in the stream, and
  // stableIndent false flattens the altitude indent.
  const declaredStream = renderCircuitObservation(scenarioEvent('first', 4), { policy: policy(), previous: true });
  const stubStream = renderCircuitObservation(scenarioEvent('first', 4), { policy: stubPolicy(), previous: true });
  assert.equal(declaredStream.split('\n')[0].trim(), '│');
  assert.equal(declaredStream.split('\n')[1].trim(), '▼');
  assert.equal(stubStream.split('\n')[0].trim(), '|');
  assert.equal(stubStream.split('\n')[1].trim(), 'v');
  const providerEvent = { observationType: 'cell-execution-testimony.v1',
    cellId: 'cell:provider:example.operation.1', cellAltitude: 'provider', durationMilliseconds: 2 };
  assert.ok(renderCircuitObservation(providerEvent, { policy: policy() }).startsWith('  ┌'));
  assert.ok(renderCircuitObservation(providerEvent, { policy: stubPolicy() }).startsWith('┌'));
});

test('a circuit render without the declared policy fails instead of using built-in values', () => {
  const overlay = { cells: [cell('cell:scenario:example', null, 'scenario',
    { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' }, [entry(5, 1)])] };
  assert.throws(() => render({ object: 'capability', verb: 'observe', format: 'circuit' }, { capabilityId: 'example', overlay }, mapping()),
    error => error.code === 'PRESENTATION_POLICY_REQUIRED' && error.exitCode === 4);
  assert.throws(() => renderCircuitObservation(scenarioEvent('first', 4), {}),
    error => error.code === 'PRESENTATION_POLICY_REQUIRED');
  // A declared policy member the emitter does not interpret is refused rather
  // than silently ignored or replaced by a built-in.
  const circuit = extra => render({ object: 'capability', verb: 'observe', format: 'circuit',
    presentation: { ...policy(), box: { ...policy().box, ...extra } } }, { capabilityId: 'example', overlay }, mapping());
  assert.throws(() => circuit({ align: 'left' }), error => error.code === 'PRESENTATION_POLICY_INCOMPLETE');
  assert.throws(() => circuit({ wrap: 'hard' }), error => error.code === 'PRESENTATION_POLICY_INCOMPLETE');
});

test('a circuit observe streams boxes to stdout in arrival order and never renders the story trace', async t => {
  const configFile = await project(t);
  const arrived = [];
  const invoked = [];
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
    invoked.push(request.subject);
    if (request.subject === 'read-circuit-presentation') return { result: { outcome: policy() } };
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
  // The policy is fetched before execution, over the same client.
  assert.deepEqual(invoked, ['read-circuit-presentation', 'example']);
  assert.deepEqual(arrived, ['cell:scenario:first', 'cell:scenario:admitted']);
  assert.ok(text.startsWith('CIRCUIT  example\n'));
  assert.ok(text.includes('SCENARIO  first'));
  assert.ok(text.includes('✓ 4 ms'));
  assert.ok(text.indexOf('SCENARIO  first') < text.indexOf('SCENARIO  admitted'));
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

test('a failed policy fetch fails the circuit command with the delivery error and no fallback', async t => {
  const configFile = await project(t);
  const factory = () => ({ execute: async request => {
    if (request.subject === 'read-circuit-presentation')
      throw new SidefxError('DELIVERY_FAILED', 'Estate delivery exited 1.', 4);
    return { payload: { capabilityId: 'example' } };
  } });
  const stdout = carrier();
  const stderr = carrier();
  const argv = ['capability', 'observe', 'example', '--input', '{}', '--format', 'circuit', '--config', configFile];
  assert.equal(await runCli(argv, { stdout: stdout.stream, stderr: stderr.stream, factory }), 4);
  assert.equal(stdout.text(), '');
  assert.ok(stderr.text().includes('DELIVERY_FAILED: Estate delivery exited 1.'));

  const malformed = () => ({ execute: async request => request.subject === 'read-circuit-presentation'
    ? { result: { outcome: { policyType: 'something-else' } } }
    : { payload: { capabilityId: 'example' } } });
  const secondOut = carrier();
  const secondErr = carrier();
  assert.equal(await runCli(argv, { stdout: secondOut.stream, stderr: secondErr.stream, factory: malformed }), 4);
  assert.equal(secondOut.text(), '');
  assert.ok(secondErr.text().includes('PRESENTATION_POLICY_REJECTED'));
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
