import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSidefx, loadConfiguration } from '../src/index.mjs';
import { runCli } from '../src/cli.mjs';
import { render } from '../src/render.mjs';

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-project-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify({
    mappingType: 'sfx-command-mapping.v1',
    identities: { capability: { pattern: '^[a-z][a-z0-9.-]*$', message: 'Supply a capability identity.' } },
    surfaces: { projection: { delivery: 'local-process', operations: ['project', 'invoke'] } },
    commands: { capability: {
      project: { min: 1, max: 1, identity: 'capability', workspace: true, targets: true, fullMechanics: true, codegenPatterns: true,
        wraps: { surface: 'projection', operation: 'project' } },
      invoke: { min: 1, max: 1, identity: 'capability', input: true, wraps: { surface: 'projection', operation: 'invoke' } },
    } } }));
  await fs.writeFile(path.join(root, 'runtime.mjs'),
    `const chunks=[];for await(const c of process.stdin)chunks.push(c);process.stdout.write(JSON.stringify({disposition:'terminated',outcome:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));`);
  const configFile = path.join(root, 'sfx.config.json');
  await fs.writeFile(configFile, JSON.stringify({ configurationType: 'sfx-project.v1', commands: 'commands.json',
    deliveries: { 'local-process': { type: 'process', command: process.execPath, args: ['runtime.mjs'], cwd: '.' } } }));
  return { configFile, ...await loadConfiguration(configFile) };
}

test('sfx capability project carries workspace, targets, full mechanics and codegen patterns through the process delivery', async t => {
  const p = await project(t);
  let stdout = '', stderr = '';
  const exit = await runCli(['capability', 'project', 'resolve-equity-market-price-evidence',
    '--workspace', 'embodiments/equity', '--targets', 'node,python,csharp', '--full-mechanics',
    '--codegen-pattern', 'sequence', '--codegen-pattern', 'selection', '--config', p.configFile, '--json'],
  { stdout: { write: value => { stdout += value; } }, stderr: { write: value => { stderr += value; } } });
  assert.equal(exit, 0, stderr);
  const delivered = JSON.parse(stdout);
  assert.equal(delivered.operation, 'project');
  assert.deepEqual(delivered.request, { object: 'capability', verb: 'project', subject: 'resolve-equity-market-price-evidence',
    workspace: 'embodiments/equity', targets: ['node', 'python', 'csharp'], fullMechanics: true,
    codegenPatterns: ['sequence', 'selection'] });
});

test('projection options are refused where the operation does not declare them', async t => {
  const p = await project(t);
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'invoke', subject: 'example', input: {}, workspace: 'w' }),
    { code: 'OPTION_NOT_APPLICABLE' });
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'invoke', subject: 'example', input: {}, fullMechanics: true }),
    { code: 'OPTION_NOT_APPLICABLE' });
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'invoke', subject: 'example', input: {}, codegenPatterns: ['sequence'] }),
    { code: 'OPTION_NOT_APPLICABLE' });
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'project', subject: 'example', targets: [] }),
    { code: 'USAGE_ERROR' });
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'project', subject: 'example', codegenPatterns: [] }),
    { code: 'USAGE_ERROR' });
  await assert.rejects(createSidefx(p).execute({ object: 'capability', verb: 'project', subject: 'example', codegenPatterns: [''] }),
    { code: 'USAGE_ERROR' });
});

test('the projection report renders each target and the conformance disposition', () => {
  const mapping = { commands: { capability: { project: { offered: true, wraps: { surface: 'projection', operation: 'project' } } } } };
  const output = render({ object: 'capability', verb: 'project' }, {
    capabilityId: 'resolve-equity-market-price-evidence',
    outDir: 'C:/workspace/projected',
    plans: [{ target: 'node', canonicalGraphDigest: 'sha256:abc', providerBindings: 137, requiredSlots: 137, mechanicsComplete: true }],
    conformance: 'PURE_PROJECTION_CONFORMS', documents: 12, files: 32, fullMechanics: true,
  }, mapping);
  assert.match(output, /Projected resolve-equity-market-price-evidence/);
  assert.match(output, /node/);
  assert.match(output, /137\/137/);
  assert.match(output, /PURE_PROJECTION_CONFORMS/);
});
