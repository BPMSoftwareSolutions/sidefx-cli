import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readDeliveryResult } from '../src/delivery-result.mjs';

test('large root execution history does not consume the result budget', async () => {
  async function* wire() {
    yield '{"executions":["';
    for (let i = 0; i < 40; i++) yield 'x'.repeat(1024 * 1024);
    yield '"],"disposition":"terminated","outcome":{"count":219,"executions":["domain fact"]}}';
  }
  assert.deepEqual(await readDeliveryResult(Readable.from(wire()), { maxResultBytes: 1024 }),
    { disposition: 'terminated', outcome: { count: 219, executions: ['domain fact'] } });
});

test('complete domain values survive byte boundaries and diagnostic-shaped keys', async () => {
  const result = JSON.parse('{"disposition":"terminated","outcome":{"__proto__":{"safe":true},"observations":[null,false,0,-0,1.25e-7],"executions":{"nestedObservations":"é🌍\\n\\\""}},"executions.outcome":{"retained":true},"errorCode":null,"nestedObservations":[1]}');
  const bytes = Buffer.from(JSON.stringify(result));
  const actual = await readDeliveryResult(Readable.from([...bytes].map(byte => Buffer.from([byte]))));
  const { nestedObservations, ...expected } = result;
  // JSON.stringify, like the original bootstrap protocol, serializes -0 as 0.
  assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)));
  assert.equal(Object.getPrototypeOf(actual.outcome), Object.prototype);
  assert.equal(Object.hasOwn(actual.outcome, '__proto__'), true);
});

test('oversized outcome and oversized wire still fail closed', async () => {
  const json = JSON.stringify({ outcome: 'x'.repeat(200) });
  await assert.rejects(readDeliveryResult(Readable.from([json]), { maxResultBytes: 100 }), { code: 'DELIVERY_OUTPUT_LIMIT' });
  await assert.rejects(readDeliveryResult(Readable.from([json]), { maxWireBytes: 100 }), { code: 'DELIVERY_OUTPUT_LIMIT' });
});

test('invalid or truncated ignored history cannot disguise an invalid document', async () => {
  for (const wire of ['', 'null', '[]', '{"outcome":{},"executions":[}', '{"outcome":{}} trailing', '{"outcome":{}', '{"outcome":{}}{}']) {
    await assert.rejects(readDeliveryResult(Readable.from([wire])), { code: 'DELIVERY_PROTOCOL_REJECTED' }, wire);
  }
});

test('failure disposition and error are retained independently of history', async () => {
  assert.deepEqual(await readDeliveryResult(Readable.from([
    '{"disposition":"failed","outcome":null,"errorCode":"PORT_HELD","observations":[{}]}'
  ])), { disposition: 'failed', outcome: null, errorCode: 'PORT_HELD' });
});
