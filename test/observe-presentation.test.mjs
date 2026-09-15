import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/cli.mjs';

const spec = extra => Object.freeze({ min: 1, max: 1, input: true, ...extra });
const mapping = { commands: { capability: {
  observe: spec({ observation: true, observationAltitudes: true, offered: true, wraps: { operation: 'observe' } }),
  invoke: spec({ offered: true, wraps: { operation: 'invoke' } }) } } };

test('observe is story-first by default and --trace opens the mechanical testimony', () => {
  const base = ['capability', 'observe', 'example', '--input', '{}'];
  assert.deepEqual(parseCommand(base, mapping).request.observationAltitudes, ['scenario']);
  assert.deepEqual(parseCommand([...base, '--trace'], mapping).request.observationAltitudes,
    ['scenario', 'mechanic', 'provider', 'physical']);
  assert.deepEqual(parseCommand([...base, '--observation-altitude', 'mechanic'], mapping).request.observationAltitudes,
    ['mechanic']);
  // An explicit altitude selection already traces that altitude; --trace only
  // widens the default.
  assert.deepEqual(parseCommand([...base, '--trace', '--observation-altitude', 'provider'], mapping)
    .request.observationAltitudes, ['provider']);
});

test('--trace and --observation-altitude stay observe-only', () => {
  const invoke = ['capability', 'invoke', 'example', '--input', '{}'];
  const notApplicable = error => error.code === 'OPTION_NOT_APPLICABLE';
  assert.throws(() => parseCommand([...invoke, '--trace'], mapping), notApplicable);
  assert.throws(() => parseCommand([...invoke, '--observation-altitude', 'scenario'], mapping), notApplicable);
});

test('a non-observation operation carries no altitude selection at all', () => {
  const request = parseCommand(['capability', 'invoke', 'example', '--input', '{}'], mapping).request;
  assert.equal(request.observationAltitudes, undefined);
});
