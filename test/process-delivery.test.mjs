import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSidefx, loadConfiguration } from '../src/index.mjs';
import { runCli } from '../src/cli.mjs';

async function project(t, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-process-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const commands = Object.fromEntries(['capability', 'capsule', 'provider'].map(object => [object, {
    invoke: { min: 1, max: 1, input: true, namespace: true, wraps: { surface: 'declared', operation: 'execute' } }
  }]));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({ mappingType: 'sfx-command-mapping.v1',
    identities: {}, surfaces: { declared: { delivery: 'local-process', operations: ['execute'] } }, commands }));
  await fs.writeFile(path.join(root, 'runtime.mjs'), source);
  const configFile = path.join(root, 'sfx.config.json');
  const document = { configurationType: 'sfx-project.v1', commands: 'commands.json', deliveries: {
    'local-process': { type: 'process', command: process.execPath, args: ['runtime.mjs'], cwd: '.' }
  } };
  await fs.writeFile(configFile, JSON.stringify(document));
  return { configFile, document, root, ...await loadConfiguration(configFile) };
}

const echo = `const chunks=[];for await(const c of process.stdin)chunks.push(c);process.stdout.write(JSON.stringify({disposition:'terminated',outcome:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));`;

test('optional observations stream before completion without changing command results', async t => {
  const p = await project(t, `
    process.stdin.resume();
    if(process.env.SIDEFX_OBSERVE==='1'){
      process.stderr.write('ordinary diagnostic\\nSFX_OBSERVATION {"sequence":');
      await new Promise(r=>setTimeout(r,20));
      process.stderr.write('1,"status":"started"}\\nSFX_OBSERVATION invalid\\n');
    }
    await new Promise(r=>setTimeout(r,80));
    process.stdout.write(JSON.stringify({disposition:'terminated',outcome:{value:42}}));
  `);
  const request = { object:'capability', verb:'invoke', subject:'example' };
  let completed = false;
  const events = [];
  const result = await createSidefx(p).execute(request, { onObservation(event) {
    assert.equal(completed, false);
    events.push(event);
    throw new Error('observer failure must not affect execution');
  } });
  completed = true;
  assert.deepEqual(events, [{sequence:1,status:'started'}]);
  assert.deepEqual(result, {value:42});
  assert.deepEqual(await createSidefx(p).execute(request), result);
});

test('CLI and SDK send the same complete typed command through the declared process', async t => {
  const p = await project(t, echo);
  const input = { contractId: 'domain.v1', object: 'different-domain', value: 'é能力', nested: [null, true] };
  for (const object of ['capability', 'capsule', 'provider']) {
    const request = { object, verb: 'invoke', subject: 'same-identity', namespace: 'explicit', input };
    const expected = { deliveryType: 'sfx-command-delivery.v1', operation: 'execute', request };
    assert.deepEqual(await createSidefx(p).execute(request), expected);
    let stdout = '', stderr = '';
    const exit = await runCli([object, 'invoke', 'same-identity', '--namespace', 'explicit', '--input', JSON.stringify(input), '--config', p.configFile, '--json'],
      { stdout: { write: value => { stdout += value; } }, stderr: { write: value => { stderr += value; } } });
    assert.equal(exit, 0, stderr);
    assert.deepEqual(JSON.parse(stdout), expected);
  }
});

test('an absent explicit delivery never falls back to an estate', async t => {
  const p = await project(t, echo);
  await assert.rejects(createSidefx({ ...p, deliveries: {}, estateRoot: p.root }).execute({ object: 'capability', verb: 'invoke', subject: 'example' }), { code: 'DELIVERY_BINDING_REQUIRED' });
});

test('the process preserves domain holds and propagates runtime failures', async t => {
  const p = await project(t, `process.stdin.resume();process.stdout.write(JSON.stringify({disposition:'terminated',outcome:{disposition:'HELD',need:'EXPLICIT_PROVIDER'}}));`);
  const request = { object: 'capability', verb: 'invoke', subject: 'example' };
  assert.deepEqual(await createSidefx(p).execute(request), { disposition: 'HELD', need: 'EXPLICIT_PROVIDER' });
  await fs.writeFile(path.join(p.root, 'runtime.mjs'), `process.stdin.resume();process.stdout.write(JSON.stringify({disposition:'failed',errorCode:'AUTHORITY_UNRESOLVED'}));process.exitCode=4;`);
  await assert.rejects(createSidefx(p).execute(request), { code: 'AUTHORITY_UNRESOLVED' });
});

test('invalid process bindings and ambiguous surface bindings are rejected', async t => {
  const p = await project(t, echo);
  p.document.deliveries['local-process'].shell = true;
  await fs.writeFile(p.configFile, JSON.stringify(p.document));
  await assert.rejects(loadConfiguration(p.configFile), { code: 'CONFIGURATION_REJECTED' });
  delete p.document.deliveries['local-process'].shell;
  await fs.writeFile(p.configFile, JSON.stringify(p.document));
  const mappingFile = path.join(p.root, 'commands.json');
  const mapping = JSON.parse(await fs.readFile(mappingFile, 'utf8'));
  mapping.surfaces.declared.capabilityId = 'ambiguous-authority';
  await fs.writeFile(mappingFile, JSON.stringify(mapping));
  await assert.rejects(loadConfiguration(p.configFile), { code: 'COMMAND_MAPPING_REJECTED' });
});
