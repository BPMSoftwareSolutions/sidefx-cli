import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesDigest, digest } from '../src/data.mjs';
import { temporary } from './helpers.mjs';
import { createSidefx, loadConfiguration } from '../src/index.mjs';

const bin = fileURLToPath(new URL('../bin/sfx.mjs', import.meta.url));
const packageRoot = fileURLToPath(new URL('../packages/http-provider/', import.meta.url));
const fixtureSecret = 'fixture-only-provider-credential-7v3p';

function cli(root, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args, '--json', '--state', path.join(root, 'state')], {
      cwd: root, env: { ...process.env, SIDEFX_ESTATE: '', SFX_TEST_PROVIDER_SECRET: fixtureSecret, ...env }, windowsHide: true,
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr,
      value: stdout ? JSON.parse(stdout) : null, error: stderr ? JSON.parse(stderr).error : null }));
  });
}

async function fixture(t, handler, settings = {}) {
  const root = await temporary(t);
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const operation = { method: 'GET', origin: `http://127.0.0.1:${server.address().port}`, path: '/sample',
    allowLoopbackHttp: true, headers: {},
    credential: { kind: 'environment', scope: 'process', name: 'SFX_TEST_PROVIDER_SECRET', header: 'X-Fixture-Credential' },
    parameters: { item: { default: 'one', pattern: '^[a-z ]+$' } },
    expectedStatus: [200], responseChecks: [{ pointer: '/item', type: 'string', equalsParameter: 'item' }] };
  const config = { configurationType: 'sfx-http-provider-config.v1', timeoutMs: 2000, maxResponseBytes: 4096,
    providers: Object.fromEntries(['custom/service', 'facility/equipment', 'rapidapi/sample'].map(id => [id,
      { defaultOperation: 'sample', operations: { sample: structuredClone(operation) } }])), ...settings };
  const providerRoot = path.join(root, 'provider');
  await mkdir(providerRoot);
  const names = ['worker.mjs', 'http.mjs', 'credentials.mjs', 'capability.json'];
  for (const name of names) await copyFile(path.join(packageRoot, name), path.join(providerRoot, name));
  await writeFile(path.join(providerRoot, 'config.json'), JSON.stringify(config));
  const manifest = { runtimeType: 'sfx-process-runtime.v1', executable: process.execPath,
    args: ['worker.mjs', 'config.json'], providerId: 'bounded-http-provider', profileId: 'bounded-http-operation.v1', runtimeFamily: 'node',
    artifacts: Object.fromEntries(await Promise.all([...names, 'config.json'].map(async name => [name, bytesDigest(await readFile(path.join(providerRoot, name)))]))),
    capabilities: { 'evaluate-http-provider': 'capability.json' } };
  const profile = path.join(providerRoot, 'runtime.json');
  await writeFile(profile, JSON.stringify(manifest));
  const routes = { routesType: 'sfx-surface-routes.v3', routes: [{ object: 'provider', verb: 'evaluate', subject: '*',
    capabilityId: 'evaluate-http-provider', authorityDigest: manifest.artifacts['capability.json'] }] };
  await writeFile(path.join(root, 'routes.json'), JSON.stringify(routes));
  await writeFile(path.join(root, 'sfx.config.json'), JSON.stringify({ configurationType: 'sfx-project.v1',
    routes: 'routes.json', runtimes: ['provider/runtime.json'] }));
  return { root, providerRoot, profile, manifest, config, requests, routes, async rebind() {
    await writeFile(path.join(providerRoot, 'config.json'), JSON.stringify(config));
    manifest.artifacts['config.json'] = bytesDigest(await readFile(path.join(providerRoot, 'config.json')));
    await writeFile(profile, JSON.stringify(manifest));
  } };
}

test('actual CLI evaluates different entity instances through one provider and retains exact binding evidence', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify({ item: new URL(req.url, 'http://fixture').searchParams.get('item') })));
  for (const id of ['custom/service', 'facility/equipment', 'rapidapi/sample']) {
    const result = await cli(f.root, ['provider', 'evaluate', id, '--input', '{"parameters":{"item":"two words"}}']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.value.result.disposition, 'PASSED');
    assert.equal(result.value.result.providerId, id);
    assert.equal(result.value.result.observation.attemptCount, 1);
    assert.deepEqual(result.value.result.response, { item: 'two words' });
    const receipt = await cli(f.root, ['execution', 'observe', result.value.executionId]);
    assert.equal(receipt.code, 0, receipt.stderr);
    assert.equal(receipt.value.capability.capsuleDigest, null);
    assert.equal(receipt.value.capability.authorityScope, 'LOCAL_INSTALLED_CAPABILITY');
    assert.equal(receipt.value.capability.managedAdmission, 'NOT_CLAIMED');
    assert.equal(receipt.value.capability.runtimeManifestDigest, bytesDigest(await readFile(f.profile)));
    assert.equal(receipt.value.context.object, 'provider');
    assert.deepEqual(receipt.value.result, result.value.result);
  }
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every(request => request.method === 'GET' && request.headers['x-fixture-credential'] === fixtureSecret));
});

test('CLI preserves HTTP denial and response failures without retry or redirect', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.startsWith('/denied')) { res.writeHead(403); return res.end('{"message":"No subscription"}'); }
    if (req.url.startsWith('/redirect')) { res.writeHead(302, { location: '/should-not-run' }); return res.end('{}'); }
    if (req.url.startsWith('/html')) return res.end('<html>error</html>');
    res.end('{"item":"wrong"}');
  });
  for (const [target, expected] of [['/denied', 'HTTP_REJECTED'], ['/redirect', 'HTTP_REJECTED'], ['/html', 'RESPONSE_NOT_JSON'], ['/mismatch', 'RESPONSE_CHECK_FAILED']]) {
    f.config.providers['custom/service'].operations.sample.path = target;
    await f.rebind();
    const result = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.value.result.disposition, expected);
    assert.equal(result.value.result.observation.attemptCount, 1);
    assert.equal(result.value.result.observation.retryCount, 0);
    assert.equal(result.value.result.observation.redirectsFollowed, 0);
  }
  assert.equal(f.requests.length, 4);
  assert.ok(f.requests.every(request => !request.url.startsWith('/should-not-run')));
});

test('missing credentials, undeclared inputs, wrong authority and artifact drift prevent network effects', async t => {
  const f = await fixture(t, (req, res) => res.end('{"item":"one"}'));
  const missing = await cli(f.root, ['provider', 'evaluate', 'custom/service'], { SFX_TEST_PROVIDER_SECRET: '' });
  assert.equal(missing.value.result.disposition, 'CREDENTIAL_UNAVAILABLE');
  assert.equal(missing.value.result.observation.attemptCount, 0);
  for (const input of ['{"parameters":{"unknown":"x"}}', '{"url":"https://other.example"}', '{"parameters":{"item":"INVALID"}}']) {
    const rejected = await cli(f.root, ['provider', 'evaluate', 'custom/service', '--input', input]);
    assert.equal(rejected.code, 4);
  }
  f.routes.routes[0].authorityDigest = `sha256:${'0'.repeat(64)}`;
  await writeFile(path.join(f.root, 'routes.json'), JSON.stringify(f.routes));
  const stale = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(stale.error.code, 'ROUTE_STALE');
  await writeFile(path.join(f.providerRoot, 'http.mjs'), '// changed');
  const changed = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(changed.error.code, 'RUNTIME_ARTIFACT_CHANGED');
  assert.equal(f.requests.length, 0);
});

test('provider bounds slow and oversized responses and redacts echoed credentials in output and receipts', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.startsWith('/slow')) { setTimeout(() => res.end('{}'), 500).unref(); return; }
    if (req.url.startsWith('/large')) return res.end('x'.repeat(5000));
    res.end(JSON.stringify({ item: 'one', arbitrary: req.headers['x-fixture-credential'],
      encoded: Buffer.from(req.headers['x-fixture-credential']).toString('base64') }));
  }, { timeoutMs: 120, maxResponseBytes: 512 });
  for (const [target, expected] of [['/slow', 'TIMED_OUT'], ['/large', 'RESPONSE_BOUND_EXCEEDED'], ['/echo', 'PASSED']]) {
    f.config.providers['custom/service'].operations.sample.path = target;
    await f.rebind();
    const result = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.value.result.disposition, expected);
    assert.ok(!result.stdout.includes(fixtureSecret));
    assert.ok(!result.stdout.includes(Buffer.from(fixtureSecret).toString('base64')));
    const receipt = await cli(f.root, ['evidence', 'inspect', result.value.executionId]);
    assert.ok(!receipt.stdout.includes(fixtureSecret));
    if (target === '/echo') assert.equal(result.value.result.response.arbitrary, '[REDACTED]');
  }
  assert.equal(f.requests.length, 3);
});

test('configured GET rejects bodies and insecure remote endpoints, while POST sends the declared JSON body', async t => {
  let observedBody;
  const f = await fixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    observedBody = Buffer.concat(chunks).toString('utf8');
    res.end('{"item":"one"}');
  });
  const operation = f.config.providers['custom/service'].operations.sample;
  operation.body = { exact: 'declared-body' };
  await f.rebind();
  assert.equal((await cli(f.root, ['provider', 'evaluate', 'custom/service'])).error.code, 'GET_BODY_REJECTED');
  operation.method = 'POST';
  await f.rebind();
  const result = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(result.value.result.disposition, 'PASSED');
  assert.deepEqual(JSON.parse(observedBody), operation.body);
  assert.equal(f.requests[0].method, 'POST');
  operation.origin = 'http://example.com';
  await f.rebind();
  assert.equal((await cli(f.root, ['provider', 'evaluate', 'custom/service'])).error.code, 'ENDPOINT_REJECTED');
  assert.equal(f.requests.length, 1);
});

test('a receipt write failure prevents the configured provider from executing', async t => {
  const f = await fixture(t, (req, res) => res.end('{"item":"one"}'));
  await writeFile(path.join(f.root, 'state'), 'cannot create receipts under a file');
  const result = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(result.code, 4);
  assert.equal(f.requests.length, 0);
});

test('local capability authority remains inspectable without masquerading as an estate capsule', async t => {
  const f = await fixture(t, (req, res) => res.end('{}'));
  const inspect = await cli(f.root, ['capability', 'inspect', 'evaluate-http-provider']);
  assert.equal(inspect.code, 0, inspect.stderr);
  assert.equal(inspect.value.capsuleDigest, null);
  assert.equal(inspect.value.capabilityAuthorityDigest, f.manifest.artifacts['capability.json']);
  for (const operation of ['inspect', 'reveal', 'evaluate']) {
    const result = await cli(f.root, ['capsule', operation, 'evaluate-http-provider']);
    assert.equal(result.error.code, 'CAPSULE_UNAVAILABLE');
  }
  const list = await cli(f.root, ['capsule', 'list']);
  assert.equal(list.code, 0, list.stderr);
  assert.deepEqual(list.value.result, []);
  assert.equal(f.requests.length, 0);
});

test('SDK snapshots the semantic command before looking up default routes', async t => {
  const f = await fixture(t, (req, res) => res.end(JSON.stringify({ item: new URL(req.url, 'http://fixture').searchParams.get('item') })));
  const sdk = createSidefx({ ...await loadConfiguration(path.join(f.root, 'sfx.config.json')), stateRoot: path.join(f.root, 'sdk-state') });
  // Configure a credential-free local test operation so the SDK test has no environment mutation.
  f.config.providers['custom/service'].operations.sample.credential = null;
  await f.rebind();
  const request = { object: 'provider', verb: 'evaluate', subject: 'custom/service', input: { parameters: { item: 'original' } } };
  const pending = sdk.execute(request);
  request.subject = 'facility/equipment';
  request.input.parameters.item = 'mutated';
  const result = await pending;
  assert.equal(result.result.providerId, 'custom/service');
  assert.equal(result.result.response.item, 'original');
});

test('selected estate configuration owns execution from any cwd and retains authority locations', async t => {
  const f = await fixture(t, (req, res) => res.end('{"item":"one"}'));
  const caller = await temporary(t);
  // This must not be loaded when an estate was explicitly selected.
  await writeFile(path.join(caller, 'sfx.config.json'), 'invalid unrelated project configuration');
  for (const selection of ['flag', 'environment']) {
    const result = await cli(caller, ['provider', 'evaluate', 'custom/service',
      ...(selection === 'flag' ? ['--estate', f.root] : [])],
    selection === 'environment' ? { SIDEFX_ESTATE: f.root } : {});
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.value.result.disposition, 'PASSED');
    const observed = await cli(caller, ['execution', 'observe', result.value.executionId, '--estate', f.root]);
    assert.equal(observed.value.capability.authorityScope, 'ESTATE_CONFIGURED_CAPABILITY');
    assert.equal(observed.value.capability.authorityPath, path.join(f.providerRoot, 'capability.json'));
    assert.equal(observed.value.capability.runtimeManifestPath, f.profile);
    assert.equal(observed.value.capability.capsuleDigest, null);
  }
  assert.equal(f.requests.length, 2);
});

test('an estate with no configuration cannot silently execute the current directory provider', async t => {
  const f = await fixture(t, (req, res) => res.end('{"item":"one"}'));
  const emptyEstate = await temporary(t);
  const result = await cli(f.root, ['provider', 'evaluate', 'custom/service', '--estate', emptyEstate]);
  assert.equal(result.error.code, 'CAPABILITY_ROUTE_REQUIRED');
  assert.equal(f.requests.length, 0);
  const explicit = await cli(f.root, ['provider', 'evaluate', 'custom/service', '--estate', emptyEstate,
    '--config', path.join(f.root, 'sfx.config.json')]);
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(f.requests.length, 1);
});

test('estate declarative bindings resolve installed package mechanics and reject unpinned or changed artifacts', async t => {
  const f = await fixture(t, (req, res) => res.end('{"item":"one"}'));
  const installedProvider = path.join(f.root, 'node_modules', '@sidefx', 'http-provider');
  await mkdir(installedProvider, { recursive: true });
  for (const name of ['package.json', 'worker.mjs', 'http.mjs', 'credentials.mjs']) {
    await copyFile(path.join(packageRoot, name), path.join(installedProvider, name));
  }
  const files = { 'module:@sidefx/http-provider': 'worker.mjs',
    'module:@sidefx/http-provider/transport': 'http.mjs',
    'module:@sidefx/http-provider/credentials': 'credentials.mjs' };
  for (const [reference, name] of Object.entries(files)) {
    f.manifest.artifacts[reference] = bytesDigest(await readFile(path.join(packageRoot, name)));
    delete f.manifest.artifacts[name];
  }
  // Authority belongs to this estate, independently of the provider's bundled example.
  const authority = JSON.parse(await readFile(path.join(f.providerRoot, 'capability.json'), 'utf8'));
  authority.name = 'Harness-owned operation evaluation';
  await writeFile(path.join(f.providerRoot, 'capability.json'), JSON.stringify(authority));
  f.manifest.artifacts['capability.json'] = bytesDigest(await readFile(path.join(f.providerRoot, 'capability.json')));
  f.routes.routes[0].authorityDigest = f.manifest.artifacts['capability.json'];
  await writeFile(path.join(f.root, 'routes.json'), JSON.stringify(f.routes));
  f.manifest.args = [{ artifact: 'module:@sidefx/http-provider' }, { artifact: 'config.json' }, { artifact: 'capability.json' }];
  await writeFile(f.profile, JSON.stringify(f.manifest));
  const project = JSON.parse(await readFile(path.join(f.root, 'sfx.config.json'), 'utf8'));
  project.estate = '.';
  await writeFile(path.join(f.root, 'sfx.config.json'), JSON.stringify(project));
  const result = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.value.result.disposition, 'PASSED');
  const observed = await cli(f.root, ['execution', 'observe', result.value.executionId]);
  assert.equal(observed.value.capability.authorityScope, 'ESTATE_CONFIGURED_CAPABILITY');
  f.manifest.artifacts['module:@sidefx/http-provider/transport'] = `sha256:${'0'.repeat(64)}`;
  await writeFile(f.profile, JSON.stringify(f.manifest));
  const changed = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(changed.error.code, 'RUNTIME_ARTIFACT_CHANGED');
  delete f.manifest.artifacts['module:@sidefx/http-provider/transport'];
  f.manifest.args[0] = { artifact: 'module:@sidefx/http-provider/unpinned' };
  await writeFile(f.profile, JSON.stringify(f.manifest));
  const unpinned = await cli(f.root, ['provider', 'evaluate', 'custom/service']);
  assert.equal(unpinned.error.code, 'RUNTIME_BINDING_REJECTED');
  assert.equal(f.requests.length, 1);
});

async function opaqueEstate(t) {
  const root = await temporary(t);
  const save = async (name, value) => writeFile(path.join(root, name), JSON.stringify(value));
  await writeFile(path.join(root, 'worker.mjs'), `
    import { readFile } from 'node:fs/promises';
    const authority = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString());
    process.stdout.write(JSON.stringify({ protocol: 'sfx-runtime-response.v1', capabilityId: authority.capabilityId,
      result: { disposition: 'FIXTURE_RETURNED', contract: authority.inputContractId,
        input: request.input, command: request.command } }));
  `);
  const bindings = [];
  for (const name of ['second', 'first']) {
    const capabilityId = `opaque-${name}`;
    const authority = { representationType: 'sfx-capability-representation.v1', capabilityId, capabilityVersion: '1.0.0',
      inputContractId: `unfamiliar-${name}-contract.v7`, contracts: {}, scenarios: [{ scenarioId: `scenario-${name}` }],
      // An entity's operation may delegate to a completely different capability.
      commandBindings: name === 'first' ? [{ ...bindings[0], object: 'capability' }] : [] };
    await save(`${name}.json`, authority);
    const pin = bytesDigest(await readFile(path.join(root, `${name}.json`)));
    bindings.push({ object: 'provider', verb: 'evaluate', capabilityId, authorityDigest: pin });
    await save(`${name}.runtime.json`, { runtimeType: 'sfx-process-runtime.v1', executable: process.execPath,
      args: [{ artifact: 'worker.mjs' }, { artifact: `${name}.json` }], providerId: `fixture/${name}`,
      profileId: `unfamiliar-${name}-profile`, runtimeFamily: 'node',
      artifacts: { 'worker.mjs': bytesDigest(await readFile(path.join(root, 'worker.mjs'))), [`${name}.json`]: pin },
      capabilities: { [capabilityId]: `${name}.json` } });
  }
  const catalog = { catalogType: 'sfx-provider-catalog.v1', providers: bindings.map((binding, index) => ({
    providerId: `arbitrary/service-${index}`, name: `Fixture ${index}`, source: { kind: 'DECLARED', reference: 'fixture:entity-authority' },
    operations: [], candidateCapabilities: [bindings[1 - index].capabilityId], commandBindings: [binding],
  })) };
  await save('catalog.json', catalog);
  await save('sfx.config.json', { configurationType: 'sfx-project.v1', estate: '.', catalogs: ['catalog.json'],
    runtimes: ['first.runtime.json', 'second.runtime.json'] });
  return { root, catalog, save };
}

test('entity metadata selects unrelated capabilities and transports their native input without contract knowledge', async t => {
  const f = await opaqueEstate(t);
  for (const [index, input] of [[0, { samples: [2, 5], nativeOption: 'exact' }], [1, false]]) {
    const result = await cli(f.root, ['provider', 'evaluate', `arbitrary/service-${index}`, '--input', JSON.stringify(input)]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.value.result.disposition, 'FIXTURE_RETURNED');
    assert.deepEqual(result.value.result.input, input);
    assert.deepEqual(result.value.result.command, { object: 'provider', verb: 'evaluate', subject: `arbitrary/service-${index}`, input });
    const receipt = await cli(f.root, ['execution', 'observe', result.value.executionId]);
    assert.equal(receipt.code, 0, receipt.stderr);
    assert.equal(receipt.value.capability.capabilityId, f.catalog.providers[index].commandBindings[0].capabilityId);
    assert.equal(receipt.value.context.source, 'ENTITY_OPERATION_AUTHORITY');
    assert.equal(receipt.value.context.entityDigest, digest(f.catalog.providers[index]));
    assert.equal(receipt.value.inputDigest, digest(input));
    assert.equal(receipt.value.commandDigest, digest(result.value.result.command));
  }
});

test('capability operation metadata overrides a built-in view through the same invocation abstraction', async t => {
  const f = await opaqueEstate(t);
  const result = await cli(f.root, ['capability', 'evaluate', 'opaque-first', '--input', '{"different":"contract"}']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.value.result.contract, 'unfamiliar-second-contract.v7');
  assert.equal(result.value.result.command.object, 'capability');
  assert.deepEqual(result.value.result.input, { different: 'contract' });
  // Metadata also works when no caller input was supplied.
  const noInput = await cli(f.root, ['capability', 'evaluate', 'opaque-first']);
  assert.equal(noInput.code, 0, noInput.stderr);
  assert.equal(noInput.value.result.contract, 'unfamiliar-second-contract.v7');
});

test('undeclared, mistyped, ambiguous and stale entity bindings never fall back to a guessed evaluator', async t => {
  const f = await opaqueEstate(t);
  const entity = f.catalog.providers[0];
  const original = structuredClone(entity.commandBindings[0]);
  for (const [bindings, code] of [
    [[], 'CAPABILITY_ROUTE_REQUIRED'],
    [[{ ...original, object: 'capability' }], 'CAPABILITY_ROUTE_REQUIRED'],
    [[original, original], 'ENTITY_BINDING_AMBIGUOUS'],
    [[{ ...original, authorityDigest: `sha256:${'0'.repeat(64)}` }], 'ROUTE_STALE'],
    [[{ ...original, provider: 'guessed-provider' }], 'ENTITY_BINDING_REJECTED'],
  ]) {
    entity.commandBindings = bindings;
    await f.save('catalog.json', f.catalog);
    const result = await cli(f.root, ['provider', 'evaluate', entity.providerId]);
    assert.equal(result.error.code, code, result.stderr);
    assert.equal(result.error.details?.executionId, undefined, 'Reject before provider execution starts');
  }
});
