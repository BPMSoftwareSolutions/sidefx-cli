import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCommand, runCli } from '../src/cli.mjs';
import { temporary } from './helpers.mjs';

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
