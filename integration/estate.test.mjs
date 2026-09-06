import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSidefx } from '../src/index.mjs';
import { projectCapability } from '../src/projection.mjs';

const estateRoot = process.env.SIDEFX_INTEGRATION_ESTATE;
const capabilityId = 'resolve-sidefx-eligible-providers';
const bin = fileURLToPath(new URL('../bin/sfx.mjs', import.meta.url));

test('live estate: discovery, three plan formats, canonical invocation, proof and retained evidence',
  { skip: !estateRoot, timeout: 180_000 }, async t => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'sfx-live-'));
    t.after(() => rm(stateRoot, { recursive: true, force: true }));
    const sdk = createSidefx({ estateRoot, stateRoot });
    const list = await sdk.execute({ verb: 'list', subject: 'capabilities' });
    assert.ok(list.result.some(item => item.capabilityId === capabilityId));
    for (const id of ['admit-consumer-source-facts', 'deliver-capsule-estate-cli', 'admit-capability-authority']) {
      const view = await sdk.inspectCapability(id);
      assert.ok(view.scenarios.length > 0, `${id} scenarios are visible`);
      assert.ok(view.providers.length > 0, `${id} provider bindings are visible`);
      assert.ok(Object.keys(view.contracts).length > 0, `${id} contracts are visible`);
    }
    const raw = await sdk.runtime.request('inspect', { capabilityId });
    const capsule = raw.result.capsule;
    const fixturesEntry = capsule.entries.find(entry => entry.entryRef === capsule.runtimeBindings[0].fixturesEntryRef);
    const fixture = JSON.parse(Buffer.from(fixturesEntry.entryBytesBase64, 'base64').toString('utf8')).fixtures[0];
    const input = fixture.input;
    // This read-only provider-resolution capability has no remote effect ports.
    const direct = spawnSync(process.execPath,
      [path.join(estateRoot, 'node_modules', 'sda-bootstrap', 'src', 'capsule-manager.mjs'), 'invoke', capabilityId],
      { cwd: estateRoot, input: JSON.stringify(input), encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, CAPSULE_SOURCE_REPOSITORY_ROOT: estateRoot } });
    assert.equal(direct.status, 0, direct.stderr);
    const invocation = await sdk.invoke(capabilityId, input);
    const withoutObservationTimes = result => ({ ...result,
      observations: result.observations.map(({ observedAt, ...observation }) => {
        assert.ok(Number.isFinite(Date.parse(observedAt)), 'runtime timestamp remains valid');
        return observation;
      }),
    });
    assert.deepEqual(withoutObservationTimes(invocation.result), withoutObservationTimes(JSON.parse(direct.stdout)),
      'Separate executions have identical results apart from their own observation timestamps');
    const receipt = await sdk.execute({ verb: 'observe', subject: invocation.executionId });
    assert.equal(receipt.capability.capsuleDigest, projectCapability(raw.result).capsuleDigest);
    assert.deepEqual(receipt.result, invocation.result);
    const cli = spawnSync(process.execPath, [bin, 'observe', invocation.executionId, '--state', stateRoot, '--json'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), receipt, 'CLI and SDK expose the same retained evidence');
    const proof = await sdk.execute({ verb: 'evaluate', subject: capabilityId });
    assert.equal(proof.executionState, 'RETURNED');
    const manifest = JSON.parse(await readFile(path.join(estateRoot, 'capsules', 'capsule-estate.manifest.json'), 'utf8'));
    assert.equal(list.result.length, manifest.capabilityCount);
    t.diagnostic(`Verified ${list.result.length} live capabilities; invocation parity and focused fixture proof passed.`);
  });
