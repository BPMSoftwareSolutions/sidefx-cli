import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCommand, runCli } from '../src/cli.mjs';
import { temporary, fakeRuntime } from './helpers.mjs';
import { createSidefx } from '../src/index.mjs';

function streams() {
  const output = { stdout: '', stderr: '' };
  return { output, stdout: { write: text => { output.stdout += text; } }, stderr: { write: text => { output.stderr += text; } } };
}

test('sfx is the installable command and help works without an estate', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/sfx.mjs', import.meta.url)), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sfx invoke/);
  assert.doesNotMatch(result.stdout, /sidefx invoke/);
  assert.equal(result.stderr, '');
});

test('grammar supports multiword discovery and provider evaluation form', () => {
  assert.deepEqual(parseCommand(['search', 'cncf', 'distributed', 'tracing']).request,
    { verb: 'search', subject: 'cncf', query: 'distributed tracing', as: undefined, scenario: undefined, via: undefined });
  assert.equal(parseCommand(['evaluate', 'provider', 'cncf/opentelemetry']).request.subject, 'cncf/opentelemetry');
});

test('object grammar treats arbitrary provider families as identity data', () => {
  for (const subject of ['rapidapi/weatherapi', 'cncf/opentelemetry', 'internal/customer-records', 'facility/drone-17', 'unknown/new-supplier']) {
    const request = parseCommand(['provider', 'inspect', subject]).request;
    assert.equal(request.object, 'provider');
    assert.equal(request.verb, 'inspect');
    assert.equal(request.subject, subject);
  }
  assert.equal(parseCommand(['provider', 'search']).request.query, '');
  assert.equal(parseCommand(['provider', 'search', 'distributed', 'tracing', '--namespace', 'custom']).request.namespace, 'custom');
  assert.equal(parseCommand(['capability', 'search', 'distributed', 'tracing']).request.query, 'distributed tracing');
  assert.equal(parseCommand(['scenario', 'inspect', 'observe-example', 'observe-example']).request.scenario, 'observe-example');
  assert.equal(parseCommand(['estate', 'inspect']).request.object, 'estate');
  assert.equal(parseCommand(['profile', 'list', '--via', 'list-profiles', '--input', '{}']).request.verb, 'list');
});

test('object grammar rejects supplier commands, flags and invalid object/operation combinations', () => {
  for (const args of [ ['rapidapi', 'inspect', 'weatherapi'], ['cncf', 'evaluate', 'opentelemetry'],
    ['provider', 'invoke', 'custom/service'], ['provider', 'inspect'], ['provider', 'inspect', 'not-namespaced'],
    ['capability', 'invoke', 'custom/service', '--input', '{}'], ['estate', 'inspect', 'extra'],
    ['scenario', 'inspect', 'observe-example'], ['provider', 'list', '--input', '{}'],
    ['provider', 'inspect', 'custom/service', '--rapidapi-key', 'value'],
    ['provider', 'search', '--namespace', 'custom', '--via', 'search-providers', '--input', '{}'],
    ['provider', 'search', '--namespace', ''], ['capability', 'inspect', 'example', '--namespace', 'custom'],
    ['scenario', 'inspect', 'example', 'scenario', '--scenario', 'other'],
    ['execution', 'observe', 'custom/service'], ['provider', 'list', '--routes', 'routes.json'],
    ['__proto__', 'inspect'], ['provider', 'constructor', 'custom/service'] ]) {
    assert.throws(() => parseCommand(args), error => error.exitCode === 2, args.join(' '));
  }
});

test('object-first invocation forwards canonical input and renders provider and scenario views', async t => {
  const root = await temporary(t);
  const runtime = fakeRuntime();
  const sdk = createSidefx({ stateRoot: root, runtime,
    catalogPaths: [fileURLToPath(new URL('../examples/provider-catalog.json', import.meta.url))] });
  const io = streams();
  const input = { payload: { providerConfiguration: { suppliedBy: 'custom/service' }, enabled: false } };
  const code = await runCli(['capability', 'invoke', 'observe-example', '--input', '-', '--json'], {
    ...io, stdin: Readable.from([JSON.stringify(input)]), factory: () => sdk,
  });
  assert.equal(code, 0, io.output.stderr);
  assert.deepEqual(runtime.calls.find(call => call.operation === 'invoke').input, input);
  const invocation = JSON.parse(io.output.stdout);
  for (const args of [ ['provider', 'inspect', 'rapidapi/weatherapi'],
    ['provider', 'search'], ['scenario', 'inspect', 'observe-example', 'observe-example'],
    ['execution', 'observe', invocation.executionId], ['evidence', 'inspect', invocation.executionId] ]) {
    const output = streams();
    assert.equal(await runCli(args, { ...output, factory: () => sdk }), 0, output.output.stderr);
    assert.ok(output.output.stdout.length > 0);
    assert.doesNotMatch(output.output.stdout, /undefined|TypeError/);
  }
});

test('invalid commands, operands and misplaced flags fail before execution', () => {
  for (const args of [ ['deploy'], ['invoke'], ['inspect', 'a', 'b'], ['find', 'x', '--as', 'blueprint'],
    ['inspect', 'a', '--input', '{}'], ['invoke', 'a', '--location', 'Detroit'], ['list', '--timeout', '0'],
    ['list', '--timeout', 'NaN'], ['list', '--timeout', '2147483648'], ['invoke', 'a', '--via', 'b'] ]) {
    assert.throws(() => parseCommand(args), error => error.exitCode === 2, args.join(' '));
  }
});

test('JSON output preserves canonical input for inline, file and stdin carriers', async t => {
  const root = await temporary(t);
  const file = path.join(root, 'request with spaces.json');
  const input = { contractId: 'weather.v1', payload: { location: 'Detroit, MI', count: 0, enabled: false } };
  await writeFile(file, `\uFEFF${JSON.stringify(input)}`);
  for (const value of [JSON.stringify(input), `@${file}`, '-']) {
    const io = streams();
    let received;
    const code = await runCli(['invoke', 'observe-weather', '--input', value, '--json'], {
      ...io, stdin: Readable.from([JSON.stringify(input)]), factory: () => ({ execute: request => { received = request; return input; } }),
    });
    assert.equal(code, 0);
    assert.deepEqual(received.input, input);
    assert.deepEqual(JSON.parse(io.output.stdout), input);
    assert.equal(io.output.stderr, '');
  }
});

test('JSON errors go to stderr and do not execute a capability', async () => {
  const io = streams();
  const code = await runCli(['invoke', 'a', '--input', '{bad}', '--json'], {
    ...io, factory: () => assert.fail('must not construct an executor'),
  });
  assert.equal(code, 2);
  assert.equal(io.output.stdout, '');
  assert.equal(JSON.parse(io.output.stderr).error.code, 'INPUT_JSON_REJECTED');
});

test('false and null inputs are not replaced with default carriers', async () => {
  for (const value of ['false', 'null', '0']) {
    const io = streams();
    await runCli(['invoke', 'a', '--input', value], {
      ...io, factory: () => ({ execute: request => { assert.deepEqual(request.input, JSON.parse(value)); return {}; } }),
    });
  }
});
