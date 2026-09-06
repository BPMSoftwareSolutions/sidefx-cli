import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EstateRuntime } from '../src/runtime.mjs';
import { temporary } from './helpers.mjs';

async function fixtureRuntime(t) {
  const root = await temporary(t);
  // Include shell metacharacters and spaces to prove that no shell constructs the invocation.
  const estateRoot = path.join(root, 'estate space & literal');
  const src = path.join(estateRoot, 'node_modules', 'sda-bootstrap', 'src');
  await mkdir(src, { recursive: true });
  await mkdir(path.join(estateRoot, 'capsules'));
  await writeFile(path.join(estateRoot, 'capsules', 'capsule-estate.manifest.json'), '{}');
  await copyFile(new URL('./fixtures/bootstrap.mjs', import.meta.url), path.join(src, 'capsule-manager.mjs'));
  // Fixture helpers import only built-in modules and the copied data utility.
  await copyFile(new URL('./helpers.mjs', import.meta.url), path.join(src, 'helpers.mjs'));
  await copyFile(new URL('../src/data.mjs', import.meta.url), path.join(src, 'data.mjs'));
  await copyFile(new URL('../src/errors.mjs', import.meta.url), path.join(src, 'errors.mjs'));
  return { runtime: new EstateRuntime({ estateRoot, timeoutMs: 10_000 }), estateRoot };
}

test('isolated runtime transports exact JSON apart from diagnostics', async t => {
  const { runtime } = await fixtureRuntime(t);
  const inspected = await runtime.request('inspect', { capabilityId: 'observe-example' });
  const input = { text: '$(command) `literal` & | ;', count: 0 };
  const response = await runtime.request('invoke', {
    capabilityId: 'observe-example', input,
    capsuleDigest: inspected.result.inspection.capsuleDigest,
    estateManifestDigest: inspected.estateManifestDigest,
  });
  assert.deepEqual(response.result.input, input);
  assert.equal(response.result.overridePresent, false);
  const proof = await runtime.request('evaluate', {
    capabilityId: 'observe-example', capsuleDigest: inspected.result.inspection.capsuleDigest,
  });
  assert.equal(proof.result.status, 'GREEN');
});

test('runtime refuses stale identity, missing capability and corruption', async t => {
  const { runtime, estateRoot } = await fixtureRuntime(t);
  await assert.rejects(runtime.request('inspect', { capabilityId: 'missing' }), error => error.code === 'CAPSULE_NOT_FOUND');
  await assert.rejects(runtime.request('invoke', { capabilityId: 'observe-example', capsuleDigest: 'stale', input: {} }), error => error.code === 'ESTATE_CHANGED');
  await assert.rejects(runtime.request('invoke', { capabilityId: 'observe-example', estateManifestDigest: 'stale', input: {} }), error => error.code === 'ESTATE_CHANGED');
  await writeFile(path.join(estateRoot, 'capsules', 'capsule-estate.manifest.json'), '{"corrupt":true}');
  await assert.rejects(runtime.request('list'), error => error.code === 'CAPSULE_DIGEST_DIVERGED');
});

test('runtime timeout terminates the delivery and reports uncertainty', async t => {
  const { runtime } = await fixtureRuntime(t);
  runtime.timeoutMs = 500;
  await assert.rejects(runtime.request('invoke', {
    capabilityId: 'observe-example', capsuleDigest: `sha256:${'a'.repeat(64)}`, input: { wait: 10_000 },
  }), error => error.code === 'RUNTIME_TIMEOUT');
});

test('runtime requires explicit estate and installed authority', async t => {
  await assert.rejects(new EstateRuntime({}).request('list'), error => error.code === 'ESTATE_REQUIRED');
  await assert.rejects(new EstateRuntime({ estateRoot: await temporary(t) }).request('list'), error => error.code === 'RUNTIME_REQUIRED');
});
