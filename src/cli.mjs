import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createSidefx } from './index.mjs';
import { readJson } from './data.mjs';
import { requireValue, SidefxError, errorRecord } from './errors.mjs';
import { render, renderObservation } from './render.mjs';
import { parseSemanticCommand, validateSemanticRequest, semanticCommand } from './commands.mjs';
import { loadConfiguration } from './configuration.mjs';

// Terminal-owned help. The command list comes from the loaded mapping, never from here.
export const help = `SideFX terminal — sfx
The command surface for the Managed Capability Estate: sfx <object> <operation> [identity].
sfx owns argument and stream carriers. Every operation belongs to the selected estate.

Options:
  --config FILE      This project's sfx.config.json (default: ./sfx.config.json)
  --estate PATH      Estate with its installed sda-bootstrap (or SIDEFX_ESTATE)
  --input VALUE      Canonical JSON, @file.json, or - for standard input
  --as VIEW          Selectable view, where the operation declares one
  --format NAME      Presentation the operation offers (e.g. markdown)
  --scenario ID      Select a scenario
  --namespace NAME   Namespace filter, where the operation declares one
  --json             Machine-readable JSON; diagnostics remain on stderr
                     (an observable operation streams its telemetry there too)
  --timeout MS       Delivery timeout in milliseconds (default 120000)
  --help, -h         Show this help
  --version          Show the version

Exit 0 means delivery completed; inspect the returned domain disposition.
Exit 2: usage/input. Exit 3: not offered by the estate. Exit 4: delivery/integrity.
`;

function operandHint(spec) {
  if (spec.query) return spec.min ? ' <query>' : ' [query]';
  if (spec.scenarioOperand) return ' <identity> <scenario>';
  if (spec.max === 2) return ' <identity> <identity>';
  return spec.min ? ' <identity>' : '';
}

export function mappingHelp(mapping) {
  const offered = [];
  const missing = [];
  for (const [object, operations] of Object.entries(mapping.commands)) {
    for (const [verb, spec] of Object.entries(operations)) {
      const line = `  sfx ${object} ${verb}${operandHint(spec)}`;
      if (spec.offered) offered.push(`${line}${spec.description ? `\n      ${spec.description}` : ''}`);
      else missing.push(`  sfx ${object} ${verb}  —  ${spec.missing.need}`);
    }
  }
  return `${help}
Offered by the selected estate (${offered.length}):
${offered.join('\n')}

Not yet offered by the estate (${missing.length}):
${missing.join('\n')}
`;
}

function parseOptions(argv) {
  try {
    return parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      config: { type: 'string' }, estate: { type: 'string' }, input: { type: 'string' },
      as: { type: 'string' }, scenario: { type: 'string' }, namespace: { type: 'string' },
      format: { type: 'string' },
      timeout: { type: 'string' }, json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    } });
  } catch (error) { throw new SidefxError('USAGE_ERROR', error.message, 2); }
}

export function parseCommand(argv, mapping) {
  const { values, positionals } = parseOptions(argv);
  if (values.help || values.version || positionals.length === 0) return { values, help: !values.version, version: values.version };
  if (values.timeout !== undefined) requireValue(/^\d+$/.test(values.timeout) && Number(values.timeout) > 0
    && Number(values.timeout) <= 2_147_483_647, 'INVALID_TIMEOUT', '--timeout must be a positive integer below 2147483648.', 2);
  const request = { ...parseSemanticCommand(positionals, mapping), as: values.as, format: values.format, namespace: values.namespace };
  requireValue(values.scenario === undefined || request.scenario === undefined,
    'OPTION_NOT_APPLICABLE', 'Supply a scenario either positionally or with --scenario.', 2);
  if (values.scenario !== undefined) request.scenario = values.scenario;
  validateSemanticRequest({ ...request, input: values.input }, mapping);
  return { values, request };
}

async function readInput(value, stdin) {
  if (value === undefined) return undefined;
  if (value.startsWith('@')) return readJson(value.slice(1));
  if (value === '-') {
    const chunks = [];
    let size = 0;
    for await (const chunk of stdin) {
      size += Buffer.byteLength(chunk);
      requireValue(size <= 8 * 1024 * 1024, 'INPUT_TOO_LARGE', 'Standard input exceeds 8 MiB.', 2);
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(value.replace(/^﻿/, '')); } catch (error) {
    throw new SidefxError('INPUT_JSON_REJECTED', `Input must be valid JSON: ${error.message}`, 2);
  }
}

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr, stdin = process.stdin, factory = createSidefx } = {}) {
  let json = argv.includes('--json');
  try {
    const preliminary = parseOptions(argv);
    if (preliminary.values.version) {
      const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
      stdout.write(preliminary.values.json ? `${JSON.stringify({ name: 'sfx', version })}\n` : `sfx ${version}\n`);
      return 0;
    }
    const selectedEstate = preliminary.values.estate ?? process.env.SIDEFX_ESTATE;
    const configuration = await loadConfiguration(preliminary.values.config, process.cwd());
    const { mapping } = configuration;
    const parsed = parseCommand(argv, mapping);
    json = parsed.values.json;
    if (parsed.help) {
      const content = mappingHelp(mapping);
      stdout.write(json ? `${JSON.stringify({ command: 'sfx', help: content })}\n` : content);
      return 0;
    }
    const { values, request } = parsed;
    request.input = await readInput(values.input, stdin);
    const sidefx = factory({ mapping, deliveries: configuration.deliveries, estateRoot: selectedEstate || configuration.estateRoot,
      timeoutMs: values.timeout === undefined ? undefined : Number(values.timeout) });
    // An operation the mapping declares observable streams its telemetry as the
    // estate reports it. Telemetry is diagnostics: it goes to stderr, never to the
    // result on stdout, and it cannot change the delivered outcome.
    const observed = semanticCommand(request.object, request.verb, mapping)?.observation === true;
    const result = await sidefx.execute(request, observed ? {
      onObservation(event) { stderr.write(renderObservation(event, json) + '\n'); },
    } : {});
    stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${render(request, result, mapping)}\n`);
    return 0;
  } catch (error) {
    if (error.code === 'EPIPE') return 0;
    const record = errorRecord(error);
    stderr.write(json ? `${JSON.stringify({ error: record })}\n`
      : `${record.code}: ${record.message}${record.details ? `\n${JSON.stringify(record.details, null, 2)}` : ''}\n`);
    return error.exitCode ?? 4;
  }
}
