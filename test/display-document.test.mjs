import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emitDocument, render } from '../src/render.mjs';
import { runCli } from '../src/cli.mjs';

const document = blocks => ({ documentType: 'sfx-display-document.v1', blocks });
const EVIDENCE = path.join('C:', 'lab', 'repos', 'sfx-embody', 'evidence', 'demo-2026-09-15T14-23-18.443Z');
const carrierFile = path.join(EVIDENCE, 'observe-say-hello-world-json.stdout.txt');
const receiptFile = path.join(EVIDENCE, 'observe-say-hello-world-trace.stdout.txt');

async function receiptSections(t) {
  let bytes;
  try { bytes = await fs.readFile(receiptFile, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') { t.skip(`${receiptFile} is not present`); return null; }
    throw error;
  }
  const lines = bytes.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const blank = lines.indexOf('');
  return { story: lines.slice(0, blank).join('\n'), trace: lines.slice(blank + 1).join('\n') };
}

test('heading blocks print the declared style: markdown prefix or plain underline', () => {
  assert.equal(emitDocument(document([{ type: 'heading', text: 'Canonical feature' }]), { as: 'markdown' }),
    '## Canonical feature');
  assert.equal(emitDocument(document([{ type: 'heading', text: 'Canonical feature' }]), { as: 'text' }),
    'Canonical feature\n-----------------');
  assert.equal(emitDocument(document([{ type: 'heading', text: 'Contracts (2)' }])),
    'Contracts (2)\n-------------');
});

test('field blocks print label, value and an optional declared note', () => {
  assert.equal(emitDocument(document([{ type: 'field', label: 'GIVEN', value: 'hello-world-request',
    note: 'hello-world-request.v1' }])),
  'GIVEN hello-world-request  (hello-world-request.v1)');
  assert.equal(emitDocument(document([{ type: 'field', label: 'Intent', value: 'request observed evidence' }])),
    'Intent request observed evidence');
});

test('lane blocks print the label then 2-space entries with declared status glyphs', () => {
  const lanes = document([{ type: 'lane', label: 'WHEN', entries: [
    { status: 'completed', text: 'say-hello-world-port', timing: '0.046 ms' },
    { status: 'failed', text: 'child-port', timing: '2 ms' },
    { status: 'unobserved', text: 'provider-call' },
    { status: 'constructor', text: 'guarded' },
    { text: 'unaddressed' }
  ] }]);
  assert.equal(emitDocument(lanes), [
    'WHEN',
    '  ✓ say-hello-world-port  0.046 ms',
    '  × child-port  2 ms',
    '  — provider-call',
    '  guarded',
    '  unaddressed'
  ].join('\n'));
});

test('an entry prints its declared note, admission and timing after the text', () => {
  const lane = document([{ type: 'lane', label: 'STREAM', entries: [
    { status: 'failed', text: 'child-port', note: 'child-port.v1', admission: 'admitted', timing: '2 ms' }
  ] }]);
  assert.equal(emitDocument(lane), 'STREAM\n  × child-port  (child-port.v1) admitted  2 ms');
});

test('a lane with an empty label prints only its entries', () => {
  const lane = document([{ type: 'lane', label: '', entries: [{ status: 'completed', text: 'say-hello-world-port' }] }]);
  assert.equal(emitDocument(lane), '  ✓ say-hello-world-port');
});

test('tree blocks recurse with 2-space indentation per depth', () => {
  const trace = document([{ type: 'tree', label: 'TRACE', entries: [
    { status: 'completed', text: 'scenario say-hello-world', timing: '0.026 ms', children: [
      { status: 'completed', text: 'say-hello-world-port', timing: '0.046 ms', children: [
        { status: 'completed', text: 'literal contractId', timing: '0.675 ms' },
        { status: 'unobserved', text: 'object' }
      ] }
    ] }
  ] }]);
  assert.equal(emitDocument(trace), [
    'TRACE',
    '✓ scenario say-hello-world  0.026 ms',
    '  ✓ say-hello-world-port  0.046 ms',
    '    ✓ literal contractId  0.675 ms',
    '    — object'
  ].join('\n'));
});

test('list blocks print one entry per line or the declared empty text', () => {
  assert.equal(emitDocument(document([{ type: 'list', items: [
    { status: 'completed', text: 'one' }, { status: 'unobserved', text: 'two' }
  ] }])), '✓ one\n— two');
  assert.equal(emitDocument(document([{ type: 'list', items: [] }])), '');
  assert.equal(emitDocument(document([{ type: 'list', items: [], emptyText: '(no declared capabilities)' }])),
    '(no declared capabilities)');
});

test('display blocks pretty-print json values and print text values verbatim', () => {
  assert.equal(emitDocument(document([{ type: 'display', as: 'json', value: { message: 'Hello, World!' } }])),
    '{\n  "message": "Hello, World!"\n}');
  assert.equal(emitDocument(document([{ type: 'display', as: 'json', value: ['a', 1] }])),
    '[\n  "a",\n  1\n]');
  assert.equal(emitDocument(document([{ type: 'display', as: 'text', value: 'Hello, World!' }])),
    'Hello, World!');
});

test('line and blank blocks print as themselves and blank lines survive the join', () => {
  assert.equal(emitDocument(document([
    { type: 'line', text: 'WHEN' }, { type: 'blank' }, { type: 'line', text: 'THEN' }
  ])), 'WHEN\n\nTHEN');
  assert.equal(emitDocument(document([{ type: 'line', text: 'a\u0000b\u001b' }])), 'ab');
  assert.equal(emitDocument(document([{ type: 'constructor', text: 'x' }, { type: 'line', text: 'y' }])), 'y');
  assert.equal(emitDocument({ documentType: 'sfx-display-document.v1', blocks: [] }), '');
});

test('the observe human path is the declared document; a result without one keeps the story fallback', () => {
  const mapping = { commands: { capability: { observe: Object.freeze({ offered: true, wraps: { operation: 'observe' } }) } } };
  const story = { scenario: { scenarioId: 'say-hello-world' } };
  const declared = document([{ type: 'line', text: 'DECLARED STORY' }]);
  assert.equal(render({ object: 'capability', verb: 'observe' },
    { story, display: { document: declared, as: 'text' } }, mapping), 'DECLARED STORY');
  assert.equal(render({ object: 'capability', verb: 'observe' }, { story }, mapping),
    'Scenario say-hello-world\nWHEN\nTHEN\n  ✓ say-hello-world');
});

test('a document wins the non-story human path over the select fallback', () => {
  const mapping = { commands: { capability: { invoke: Object.freeze({ offered: true, wraps: { operation: 'invoke' } }) } } };
  const declared = document([{ type: 'line', text: 'DECLARED VALUE' }]);
  const payload = { display: { document: declared, as: 'text', select: 'outcome.payload.message' },
    result: { outcome: { payload: { message: 'FALLBACK' } } } };
  assert.equal(render({ object: 'capability', verb: 'invoke' }, payload, mapping), 'DECLARED VALUE');
  assert.equal(render({ object: 'capability', verb: 'invoke', display: true },
    { display: { select: 'outcome.payload', as: 'json' }, result: { outcome: { payload: { message: 'FALLBACK' } } } },
    mapping), '{\n  "message": "FALLBACK"\n}');
});

test('the declared document owns the trace reading; the terminal does not append its own trace', () => {
  const mapping = { commands: { capability: { observe: Object.freeze({ offered: true, wraps: { operation: 'observe' } }) } } };
  const overlay = { cells: [{ cellId: 'cell:scenario:example', parentCellId: null,
    semanticAddress: { semanticRole: 'SCENARIO_OUTCOME', scenarioId: 'example' },
    observed: [{ disposition: 'completed', durationMilliseconds: 5, logicalOrder: 1 }] }] };
  const declared = document([
    { type: 'line', text: 'Scenario example' },
    { type: 'tree', label: 'TRACE', entries: [{ status: 'completed', text: 'scenario example', timing: '5 ms' }] },
  ]);
  assert.equal(render({ object: 'capability', verb: 'observe', trace: true },
    { story: { scenario: { scenarioId: 'example' } }, overlay, display: { document: declared, as: 'text' } }, mapping),
  'Scenario example\nTRACE\n✓ scenario example  5 ms');
});

test('carrier story parity: the emitted bytes equal the receipt story section (the receipt is a separate run, so only the WHEN duration is normalized)', async t => {
  let carrier;
  try { carrier = JSON.parse(await fs.readFile(carrierFile, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') { t.skip(`${carrierFile} is not present`); return; }
    throw error;
  }
  const sections = await receiptSections(t);
  if (!sections) return;
  const story = carrier.story;
  const timing = value => typeof value === 'number'
    ? (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`) : '';
  const emitted = emitDocument(document([
    { type: 'line', text: `Scenario ${story.scenario.scenarioId}` },
    { type: 'field', label: 'GIVEN', value: story.scenario.inputId, note: story.scenario.inputContractId },
    { type: 'lane', label: 'WHEN', entries: story.scenario.responsibilities.map(entry => ({
        status: entry.disposition, text: entry.responsibilityId, timing: timing(entry.durationMilliseconds) })) },
    { type: 'lane', label: 'THEN', entries: [{ status: carrier.result.disposition, text: story.scenario.outcomeId,
        note: story.scenario.outcomeContractId }] }
  ]));
  assert.match(emitted, /  ✓ say-hello-world-port  0\.036 ms/);
  assert.equal(emitted.replace(/ \d+(?:\.\d+)? ms/g, ' <timing>'),
    sections.story.replace(/ \d+(?:\.\d+)? ms/g, ' <timing>'));
});

test('declared trace parity: the emitted tree bytes equal the receipt TRACE section', async t => {
  const sections = await receiptSections(t);
  if (!sections) return;
  const trace = emitDocument(document([{ type: 'tree', label: 'TRACE', entries: [
    { status: 'completed', text: 'scenario say-hello-world', timing: '0.026 ms', children: [
      { status: 'completed', text: 'say-hello-world-port', timing: '0.046 ms', children: [
        { status: 'completed', text: 'literal contractId', timing: '0.675 ms' },
        { status: 'completed', text: 'literal payload.message', timing: '0.046 ms' },
        { status: 'completed', text: 'object payload', timing: '0.067 ms' },
        { status: 'completed', text: 'object', timing: '0.045 ms' }
      ] }
    ] }
  ] }]));
  assert.equal(trace, sections.trace);
});

test('--json carries the document additively while the human path emits its bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-display-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({
    mappingType: 'sfx-command-mapping.v1',
    identities: { capability: { pattern: '^[a-z][a-z0-9.-]*$', message: 'Supply a capability identity.' } },
    surfaces: { estate: { capabilityId: 'deliver-estate', request: 'estate-request.v1', operations: ['observe'] } },
    commands: { capability: { observe: { min: 1, max: 1, identity: 'capability', input: true, observation: true, display: true,
      wraps: { surface: 'estate', operation: 'observe' } } } }
  }));
  const configFile = path.join(root, 'sfx.config.json');
  await fs.writeFile(configFile, JSON.stringify({ configurationType: 'sfx-project.v1', commands: 'commands.json' }));
  const declared = document([{ type: 'display', as: 'text', value: 'Hello, World!' }]);
  const outcome = { capabilityId: 'say-hello-world', display: { document: declared, as: 'text' },
    story: { scenario: { scenarioId: 'say-hello-world' } } };
  const factory = () => ({ execute: async () => outcome });
  let stdout = '';
  const streams = { stdout: { write: value => { stdout += value; } }, stderr: { write: () => {} }, factory };
  const argv = ['capability', 'observe', 'say-hello-world', '--input', '{}', '--config', configFile];
  assert.equal(await runCli([...argv, '--json'], streams), 0);
  assert.deepEqual(JSON.parse(stdout), outcome);
  stdout = '';
  assert.equal(await runCli(argv, streams), 0);
  assert.equal(stdout, 'Hello, World!\n');
});
