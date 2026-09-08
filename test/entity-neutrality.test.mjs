import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommandMapping, parseSemanticCommand, validateSemanticRequest } from '../src/commands.mjs';

const mapping = await loadCommandMapping(new URL('../sfx.commands.json', import.meta.url));

test('entity type survives colliding identity spellings', () => {
  for (const object of ['capability', 'capsule', 'provider']) {
    const request = parseSemanticCommand([object, 'inspect', 'same-identity'], mapping);
    assert.equal(request.object, object);
    assert.equal(request.subject, 'same-identity');
    assert.equal(validateSemanticRequest(request, mapping), mapping.commands[object].inspect);
  }
  const execution = parseSemanticCommand(['execution', 'inspect', 'same-identity'], mapping);
  assert.equal(execution.object, 'execution');
  assert.throws(() => validateSemanticRequest(execution, mapping), { code: 'IDENTITY_REJECTED' });
});

test('domain-specific values stay inside canonical input', () => {
  const request = { object: 'capability', verb: 'invoke', subject: 'example-capability',
    input: { provider: 'vendor.example', operation: 'vendor-call', runtime: 'custom', object: 'provider' } };
  assert.equal(validateSemanticRequest(request, mapping), mapping.commands.capability.invoke);
  assert.throws(() => validateSemanticRequest({ ...request, runtime: 'custom' }, mapping), { code: 'REQUEST_FIELD_REJECTED' });
});

test('unavailable provider operation remains unavailable', () => {
  const request = { object: 'provider', verb: 'assimilate', subject: 'vendor-example' };
  assert.equal(validateSemanticRequest(request, mapping).offered, false);
});
