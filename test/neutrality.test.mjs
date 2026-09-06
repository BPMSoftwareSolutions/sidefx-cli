import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { parseCommand } from '../src/cli.mjs';
import { createSidefx } from '../src/index.mjs';
import { temporary, fakeRuntime, capsuleFixture } from './helpers.mjs';

test('entity identities never introduce command syntax or domain flags', () => {
  const execution = 'exec-12345678-1234-4567-8123-123456789abc';
  for (const [object, operands] of [
    ['provider', ['internal/customer-records']], ['capability', ['approve-mortgage']],
    ['capsule', [execution]], ['scenario', ['weather-observation', 'publish']],
    ['execution', [execution]], ['estate', []], ['profile', ['python/model-worker']], ['evidence', [execution]],
  ]) {
    const request = parseCommand([object, 'inspect', ...operands]).request;
    assert.equal(request.object, object);
    assert.equal(request.verb, 'inspect');
    for (const flag of ['--location', '--model', '--interest-rate', '--event', '--outcome']) {
      assert.throws(() => parseCommand([object, 'inspect', ...operands, flag, 'value']),
        error => error.exitCode === 2);
    }
  }
  for (const instance of ['approve-mortgage', 'weather-observation', 'python', 'rapidapi', 'publish-payment']) {
    assert.throws(() => parseCommand([instance, 'inspect']), error => error.code === 'COMMAND_REJECTED');
  }
});

test('explicit entity kinds survive identifiers that also look like execution receipts', async t => {
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  const invocation = await sdk.invoke('observe-example', {});
  const subject = invocation.executionId;
  for (const object of ['capability', 'capsule']) {
    runtime.calls.length = 0;
    const inspected = await sdk.execute({ object, verb: 'inspect', subject });
    assert.equal(inspected.capabilityId, subject);
    const compared = await sdk.execute({ object, verb: 'compare', subject, other: subject });
    assert.deepEqual(compared.changes, []);
    assert.equal(runtime.calls.length, 3, `${object} comparison must read capsules, not receipts`);
    assert.ok(runtime.calls.every(call => call.operation === 'inspect' && call.capabilityId === subject));
  }
  for (const object of ['execution', 'evidence']) {
    runtime.calls.length = 0;
    assert.equal((await sdk.execute({ object, verb: 'inspect', subject })).executionId, subject);
    assert.deepEqual((await sdk.execute({ object, verb: 'compare', subject, other: subject })).changes, []);
    assert.equal(runtime.calls.length, 0);
  }
  // A missing selected authority must not fall back to a different entity with the same spelling.
  runtime.request = async () => { throw new Error('CAPSULE_NOT_FOUND'); };
  await assert.rejects(sdk.execute({ object: 'capability', verb: 'compare', subject, other: subject }), /CAPSULE_NOT_FOUND/);
  assert.equal((await sdk.execute({ object: 'evidence', verb: 'inspect', subject })).executionId, subject);
});

test('SDK command fields cannot smuggle domain data or override dispatch', async t => {
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: await temporary(t), runtime });
  for (const field of ['location', 'model', 'event', 'outcome', 'provider', 'collection', 'localOnly', 'runtime']) {
    await assert.rejects(sdk.execute({ object: 'capability', verb: 'invoke', subject: 'observe-example', input: {}, [field]: true }),
      error => error.code === 'REQUEST_FIELD_REJECTED', field);
  }
  assert.equal(runtime.calls.length, 0);
  const input = { object: 'provider', verb: 'admit', subject: 'another-entity', runtime: 'python',
    event: 'publish', outcome: 'approved', location: 'Detroit', model: 'caller-supplied' };
  const invoked = await sdk.execute({ object: 'capability', verb: 'invoke', subject: 'observe-example', input });
  assert.deepEqual(runtime.calls[1].input, input, 'Domain data remains unchanged inside canonical input');
  const receipt = await sdk.receipts.read(invoked.executionId);
  assert.equal(receipt.context.object, 'capability');
  assert.equal(receipt.context.operation, 'invoke');
  for (const object of ['capability', 'capsule']) {
    const evaluated = await sdk.execute({ object, verb: 'evaluate', subject: 'observe-example' });
    const proof = await sdk.receipts.read(evaluated.executionId);
    assert.equal(proof.context.object, object);
    assert.equal(proof.context.evaluationScope, 'CAPSULE_FIXTURE_PROOF');
  }
});

test('scenario, input, event and outcome identities remain exact capsule authority', async t => {
  const stateRoot = await temporary(t);
  for (const [capability, scenario, input, event, outcome] of [
    ['observe-weather', 'publish', 'python/request', 'rapidapi/exchange', 'admitted'],
    ['assess-mortgage', 'internal/eligibility', 'customer-facts', 'evaluate', 'PROVIDER_REQUIRED'],
  ]) {
    const fixture = capsuleFixture(capability, { scenarioId: scenario, inputId: input, eventId: event, outcomeId: outcome });
    const calls = [];
    const sdk = createSidefx({ stateRoot, runtime: { async request(operation, fields) {
      calls.push({ operation, ...fields });
      return { estateManifestDigest: 'fixture-generation', result: fixture };
    } } });
    const view = await sdk.execute(parseCommand(['scenario', 'inspect', capability, scenario]).request);
    const selected = view.scenarios[0];
    assert.equal(selected.scenarioId, scenario);
    assert.equal(selected.input.inputId, input);
    assert.equal(selected.event.eventId, event);
    assert.equal(selected.outcome.outcomeId, outcome);
    assert.equal(view.capsuleDigest, fixture.inspection.capsuleDigest);
    assert.deepEqual(calls, [{ operation: 'inspect', capabilityId: capability }]);
    await assert.rejects(sdk.execute({ object: 'scenario', verb: 'inspect', subject: capability, scenario: 'unobserved-scenario' }),
      error => error.code === 'SCENARIO_NOT_FOUND');
  }
});

test('all bindable entity kinds resolve only their own object and operation', async t => {
  const stateRoot = await temporary(t);
  const routesPath = path.join(stateRoot, 'routes.json');
  const kinds = ['provider', 'capability', 'capsule', 'profile'];
  const routes = kinds.map(object => ({ object, verb: 'evaluate', subject: '*',
    capabilityId: `evaluate-${object}`, capsuleDigest: `sha256:${'a'.repeat(64)}` }));
  await writeFile(routesPath, JSON.stringify({ routesType: 'sfx-surface-routes.v2', routes }));
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot, runtime, routesPath });
  for (const object of kinds) {
    const subject = object === 'provider' ? 'internal/shared-identity' : 'shared-identity';
    const input = { object: 'unrelated-object', event: 'publish', target: 'another-runtime' };
    const execution = await sdk.execute({ object, verb: 'evaluate', subject, input });
    assert.equal(runtime.calls.at(-1).capabilityId, `evaluate-${object}`);
    assert.deepEqual(runtime.calls.at(-1).input, input);
    const receipt = await sdk.receipts.read(execution.executionId);
    assert.equal(receipt.context.object, object);
    assert.equal(receipt.subject, subject);
  }
  await assert.rejects(sdk.execute({ object: 'profile', verb: 'resolve', subject: 'shared-identity', input: {} }),
    error => error.code === 'CAPABILITY_ROUTE_REQUIRED');
});

test('object-scoped route data cannot add runtime or entity-specific dispatch policy', async t => {
  const stateRoot = await temporary(t);
  const routesPath = path.join(stateRoot, 'routes.json');
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot, runtime, routesPath });
  const route = { object: 'profile', verb: 'inspect', subject: '*', capabilityId: 'inspect-profile',
    capsuleDigest: `sha256:${'a'.repeat(64)}` };
  for (const extension of [{ runtime: 'python' }, { model: 'custom-model' }, { event: 'dispatch-me' }]) {
    await writeFile(routesPath, JSON.stringify({ routesType: 'sfx-surface-routes.v2', routes: [{ ...route, ...extension }] }));
    await assert.rejects(sdk.execute({ object: 'profile', verb: 'inspect', subject: 'shared-identity', input: {} }),
      error => error.code === 'ROUTES_REJECTED');
    await writeFile(routesPath, JSON.stringify({ routesType: 'sfx-surface-routes.v2', routes: [route], ...extension }));
    await assert.rejects(sdk.execute({ object: 'profile', verb: 'inspect', subject: 'shared-identity', input: {} }),
      error => error.code === 'ROUTES_REJECTED');
  }
  assert.equal(runtime.calls.length, 0);
});
