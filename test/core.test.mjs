import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createSidefx, SidefxError } from '../src/index.mjs';
import { digest } from '../src/data.mjs';
import { projectCapability, revealCapability, structuralDiff } from '../src/projection.mjs';
import { ReceiptStore } from '../src/receipts.mjs';
import { ProviderCatalog } from '../src/catalog.mjs';
import { temporary, fakeRuntime, capsuleFixture } from './helpers.mjs';

test('scenario and blueprint views retain capsule authority and exact geometry', () => {
  const capability = projectCapability(capsuleFixture());
  assert.equal(capability.scenarios[0].input.inputId, 'example-input');
  assert.equal(capability.providers[0].providerCapabilityId, 'example-provider.v1');
  assert.deepEqual(revealCapability(capability, { as: 'blueprint' }).value.nodes, [{ nodeId: 'observe-example' }]);
  assert.equal(revealCapability(capability, { as: 'contracts' }).contracts['example.v1'].schema.type, 'object');
  assert.throws(() => revealCapability(capability, { scenario: 'invented' }), /No scenario/);
  assert.throws(() => revealCapability({ ...capability, blueprint: null }, { as: 'blueprint' }), /does not carry/);
});

test('invocation preserves input and result, binds exact generation, and records redacted evidence', async t => {
  const stateRoot = await temporary(t);
  const input = { password: 'input-secret', payload: { n: 1 } };
  const raw = { disposition: 'terminated', outcome: { payload: { disposition: 'PROVIDER_REQUIRED', apiKey: 'result-secret' } } };
  const runtime = fakeRuntime({ output: raw });
  const sdk = createSidefx({ runtime, stateRoot });
  const invocation = await sdk.execute({ verb: 'invoke', subject: 'observe-example', input });
  assert.deepEqual(invocation.result, raw);
  assert.equal(invocation.executionState, 'RETURNED');
  assert.deepEqual(runtime.calls[1].input, input);
  assert.equal(runtime.calls[1].estateManifestDigest, 'estate-generation-one');
  assert.equal(runtime.calls[1].capsuleDigest, `sha256:${'a'.repeat(64)}`);
  const receipt = await sdk.execute({ verb: 'observe', subject: invocation.executionId });
  assert.equal(receipt.inputDigest, digest(input));
  assert.equal(receipt.resultDigest, digest(raw));
  assert.equal(receipt.result.outcome.payload.apiKey, '[REDACTED]');
  assert.equal(receipt.result.outcome.payload.disposition, 'PROVIDER_REQUIRED');
  assert.doesNotMatch(await readFile(sdk.receipts.file(invocation.executionId), 'utf8'), /input-secret|result-secret/);
  const explanation = await sdk.execute({ verb: 'explain', subject: invocation.executionId });
  assert.equal(explanation.intent, 'Observe an example.');
  assert.deepEqual(explanation.result, receipt.result);
});

test('failed invocation remains observable with its original error', async t => {
  const stateRoot = await temporary(t);
  const sdk = createSidefx({ stateRoot, runtime: fakeRuntime({ failure: new SidefxError('CONTRACT_REJECTED', 'Invalid carrier', 4) }) });
  let executionId;
  await assert.rejects(sdk.invoke('observe-example', {}), error => {
    executionId = error.details.executionId;
    return error.code === 'CONTRACT_REJECTED';
  });
  const receipt = await sdk.receipts.read(executionId);
  assert.equal(receipt.executionState, 'DELIVERY_FAILED');
  assert.equal(receipt.error.code, 'CONTRACT_REJECTED');
  assert.equal((await sdk.receipts.list()).length, 1);
});

test('receipt tampering and traversal fail closed', async t => {
  const stateRoot = await temporary(t);
  const sdk = createSidefx({ stateRoot, runtime: fakeRuntime() });
  const invoked = await sdk.invoke('observe-example', {});
  const file = sdk.receipts.file(invoked.executionId);
  const receipt = JSON.parse(await readFile(file, 'utf8'));
  receipt.executionState = 'FAKE_SUCCESS';
  await writeFile(file, JSON.stringify(receipt));
  await assert.rejects(sdk.receipts.read(invoked.executionId), error => error.code === 'RECEIPT_INTEGRITY_FAILED');
  await assert.rejects(new ReceiptStore(stateRoot).read('../secret'), error => error.code === 'EXECUTION_ID_REJECTED');
});

test('unwritable receipt destination prevents effects', async t => {
  const root = await temporary(t);
  const stateRoot = path.join(root, 'not-a-directory');
  await writeFile(stateRoot, 'occupied');
  const runtime = fakeRuntime();
  await assert.rejects(createSidefx({ stateRoot, runtime }).invoke('observe-example', {}));
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0].operation, 'inspect');
});

test('concurrent invocations retain independent receipts', async t => {
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime: fakeRuntime() });
  const results = await Promise.all(Array.from({ length: 8 }, (_, n) => sdk.invoke('observe-example', { n })));
  assert.equal(new Set(results.map(result => result.executionId)).size, 8);
  assert.equal((await sdk.receipts.list()).length, 8);
});

test('routes dispatch only the exact bound capability with canonical caller input', async t => {
  const stateRoot = await temporary(t);
  const routesPath = path.join(stateRoot, 'routes.json');
  const route = { verb: 'publish', subject: 'example-change', capabilityId: 'publish-example', capsuleDigest: `sha256:${'a'.repeat(64)}` };
  await writeFile(routesPath, JSON.stringify({ routesType: 'sfx-surface-routes.v1', routes: [route] }));
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot, runtime, routesPath });
  const input = { contractId: 'publication.v1', payload: { approved: false } };
  await sdk.execute({ verb: 'publish', subject: 'example-change', input });
  assert.equal(runtime.calls[1].capabilityId, 'publish-example');
  assert.deepEqual(runtime.calls[1].input, input);
  route.capsuleDigest = `sha256:${'b'.repeat(64)}`;
  await writeFile(routesPath, JSON.stringify({ routesType: 'sfx-surface-routes.v1', routes: [route] }));
  await assert.rejects(sdk.execute({ verb: 'publish', subject: 'example-change', input }), error => error.code === 'ROUTE_STALE');
  assert.equal(runtime.calls.filter(call => call.operation === 'invoke').length, 1);
});

test('missing provider authority cannot produce conformance or assimilation success', async t => {
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  for (const verb of ['evaluate', 'assimilate', 'install', 'publish', 'govern', 'author']) {
    await assert.rejects(sdk.execute({ verb, subject: 'rapidapi/weatherapi' }), error => error.code === 'CAPABILITY_ROUTE_REQUIRED');
  }
  assert.equal(runtime.calls.length, 0);
});

test('fixture evaluation reports its actual proof scope and never invokes a business request', async t => {
  const runtime = fakeRuntime({ output: { status: 'GREEN' } });
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  const result = await sdk.execute({ verb: 'evaluate', subject: 'observe-example' });
  const receipt = await sdk.receipts.read(result.executionId);
  assert.equal(receipt.context.evaluationScope, 'CAPSULE_FIXTURE_PROOF');
  assert.equal(runtime.calls[1].operation, 'evaluate');
  assert.equal(receipt.inputDigest, null);
});

test('discovery retains provenance and local registration never admits a provider', async t => {
  const stateRoot = await temporary(t);
  const catalog = new ProviderCatalog({ stateRoot, catalogPaths: [fileURLToPath(new URL('../examples/provider-catalog.json', import.meta.url))] });
  const results = await catalog.search('rapidapi', 'weather');
  assert.equal(results[0].source.kind, 'ILLUSTRATIVE');
  assert.equal(results[0].conformanceClaims, null);
  const first = await catalog.add('rapidapi/weatherapi');
  assert.deepEqual(await catalog.add('rapidapi/weatherapi'), first);
  assert.equal(first.disposition, 'REFERENCE_REGISTERED');
  await catalog.add('local/unknown');
  assert.equal((await catalog.inspect('local/unknown')).evidenceScope, 'LOCAL_REFERENCE_ONLY');
  await assert.rejects(catalog.add('../outside'), error => error.code === 'PROVIDER_ID_REJECTED');
  await assert.rejects(catalog.search('missing', 'weather'), error => error.code === 'DISCOVERY_SOURCE_REQUIRED');
  await catalog.remove('local/unknown');
  assert.equal((await catalog.registered()).length, 1);
});

test('structural comparison preserves JSON pointer escaping and does not claim semantic equivalence', () => {
  assert.deepEqual(structuralDiff({ 'a/b': 1, gone: true }, { 'a/b': 2, added: false }), [
    { path: '/a~1b', kind: 'changed', before: 1, after: 2 },
    { path: '/added', kind: 'added', after: false },
    { path: '/gone', kind: 'removed', before: true },
  ]);
});

test('SDK rejects non-JSON inputs before resolving or invoking authority', async t => {
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  const cyclic = {}; cyclic.self = cyclic;
  for (const input of [NaN, Infinity, 1n, { field: undefined }, new Date(), cyclic, [() => {}]]) {
    await assert.rejects(sdk.invoke('observe-example', input), error => error.code === 'JSON_VALUE_REJECTED');
  }
  assert.equal(runtime.calls.length, 0);
});

test('SDK snapshots mutable input before asynchronous work', async t => {
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  const input = { payload: { location: 'Detroit' } };
  const invocation = sdk.invoke('observe-example', input);
  input.payload.location = 'changed after invocation';
  const result = await invocation;
  assert.equal(runtime.calls[1].input.payload.location, 'Detroit');
  assert.equal((await sdk.receipts.read(result.executionId)).inputDigest, digest({ payload: { location: 'Detroit' } }));
});

test('provider references cannot collide across namespace boundaries', async t => {
  const catalog = new ProviderCatalog({ stateRoot: await temporary(t) });
  await catalog.add('a--b/c');
  await catalog.add('a/b--c');
  assert.equal((await catalog.registered()).length, 2);
  assert.equal((await catalog.inspect('a--b/c')).providerId, 'a--b/c');
  assert.equal((await catalog.inspect('a/b--c')).providerId, 'a/b--c');
});

test('v3 scenario views bind exact feature identities and preserve native cells', () => {
  const fixture = capsuleFixture();
  const cell = { cellId: 'cell:scenario:observe-example', altitude: 'scenario',
    input: { contractId: 'example.v1' }, execution: { authorityId: 'observe-example.v1' },
    outcome: { contractId: 'example-outcome.v1', variants: ['OBSERVED', 'HELD'] } };
  const plan = { executionEmbodimentPlanType: 'consumer-execution-embodiment-plan.v3',
    canonicalGraph: { cells: [cell], edges: [] },
    realizationOverlay: { providerBindings: [{ slotId: 'slot:observe', mechanicId: 'observe.v1', providerProfileId: 'node:observe' }] },
    contractCatalog: { contracts: { 'example.v1': { schema: { type: 'object' } } } },
  };
  fixture.capsule.entries.find(entry => entry.entryId === 'plan').entryBytesBase64 = Buffer.from(JSON.stringify(plan)).toString('base64');
  fixture.featureDocument = { feature: { children: [{ rule: { children: [{ scenario: { name: 'Observe example',
    tags: ['@scenario:observe-example', '@input:source-data', '@event:observation-requested', '@outcome:evidence', '@outcome-terminal'].map(name => ({ name })),
    steps: [{ keyword: 'Given ', text: 'source data' }],
  } }] } }] } };
  const view = projectCapability(fixture);
  assert.deepEqual(view.scenarios[0].nativeCell, cell);
  assert.equal(view.scenarios[0].event.eventId, 'observation-requested');
  assert.equal(view.scenarios[0].outcome.terminal, true);
  assert.equal(view.providers[0].nativeBinding.slotId, 'slot:observe');
  assert.equal(view.contracts['example.v1'].schema.type, 'object');
  assert.throws(() => projectCapability({ ...fixture, featureDocument: null }), /No capsule feature identity/);
});
