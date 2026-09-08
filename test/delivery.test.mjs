import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deliver } from '../src/delivery.mjs';
import { createSidefx, loadCommandMapping } from '../src/index.mjs';
import { pathToFileURL } from 'node:url';

async function mockEstate(t, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-delivery-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const installed = path.join(root, 'node_modules', 'sda-bootstrap');
  await fs.mkdir(installed, { recursive: true });
  await fs.writeFile(path.join(installed, 'package.json'), JSON.stringify({ bin: { 'sda-bootstrap': 'entry.mjs' } }));
  await fs.writeFile(path.join(installed, 'entry.mjs'), source);
  return root;
}

test('transport delivers unchanged canonical input through the declared process', async t => {
  const estateRoot = await mockEstate(t, `let text='';for await(const c of process.stdin)text+=c;process.stdout.write(JSON.stringify({disposition:'terminated',outcome:JSON.parse(text),executions:[{notDomainData:true}]}));`);
  const request = { contractId: 'arbitrary-contract.v1', payload: { vendor: 'unrelated', observations: [1] } };
  assert.deepEqual(await deliver({ estateRoot, capabilityId: 'arbitrary-capability', request }), { disposition: 'terminated', outcome: request });
});

test('process stderr and exit are retained when no JSON is emitted', async t => {
  const estateRoot = await mockEstate(t, `process.stderr.write('native transport diagnostic');process.exit(7);`);
  await assert.rejects(deliver({ estateRoot, capabilityId: 'example', request: {} }),
    error => error.code === 'DELIVERY_FAILED' && /exited 7.*native transport diagnostic/.test(error.message));
});

test('declared surface receives a disposable parent independently of canonical capability input', async t => {
  const estateRoot = await mockEstate(t, `let text='';for await(const c of process.stdin)text+=c;process.stdout.write(JSON.stringify({disposition:'terminated',outcome:JSON.parse(text)}));`);
  const mapping = await loadCommandMapping(new URL('../sfx.commands.json', import.meta.url));
  const input = { contractId: 'example.v1', payload: { disposableParentRootRef: 'domain-owned-value' } };
  const result = await createSidefx({ mapping, estateRoot }).execute({ object: 'capability', verb: 'invoke', subject: 'example', input });
  assert.equal(result.payload.disposableParentRootRef, pathToFileURL(os.tmpdir() + path.sep).href);
  assert.deepEqual(result.payload.capabilityInput, input);
  assert.equal(result.payload.capabilityId, 'example');
});

test('timeout interrupts a process that never returns', async t => {
  const estateRoot = await mockEstate(t, `process.stdin.resume();setInterval(()=>{},1000);`);
  await assert.rejects(deliver({ estateRoot, capabilityId: 'example', request: {}, timeoutMs: 100 }), { code: 'DELIVERY_TIMEOUT' });
});
