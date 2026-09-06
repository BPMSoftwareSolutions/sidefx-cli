import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesDigest } from '../src/data.mjs';
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
