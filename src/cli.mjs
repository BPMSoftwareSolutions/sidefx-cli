import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createSidefx } from './index.mjs';
import { requireValue, SidefxError, errorRecord } from './errors.mjs';
import { render, renderObservation, createStreamClock } from './render.mjs';
import { parseSemanticCommand, validateSemanticRequest, semanticCommand, OBSERVATION_ALTITUDES } from './commands.mjs';
import { loadConfiguration } from './configuration.mjs';

// Terminal-owned help. The command list comes from the loaded mapping, never from here.
export const help = `SideFX terminal — sfx
The command surface for the Managed Capability Estate: sfx <object> <operation> [identity].
sfx owns argument and stream carriers. Every operation belongs to the selected estate.

Options:
  --config FILE      This project's sfx.config.json (default: ./sfx.config.json)
  --estate PATH      Estate with its installed sda-bootstrap (or SIDEFX_ESTATE)
  --input VALUE      Canonical JSON, @file.json, or - for standard input
  --input-type NAME  Type of a raw input scalar: json (default), text, number, boolean
  --as VIEW          Selectable view, where the operation declares one
  --format NAME      Presentation the operation offers (e.g. markdown)
  --display          Apply the capability's declared display projection
  --scenario ID      Select a scenario
  --namespace NAME   Namespace filter, where the operation declares one
  --workspace PATH   Projection workspace: the declared documents are staged
                     there and the mechanical bodies generate under projected/
  --targets NAMES    Comma-separated projection targets, where the operation
                     projects; the workspace's declared targets are the default
  --full-mechanics   Require every canonical cell's platform mechanic to be bound
                     for every selected target; projection operations only
  --codegen-pattern TYPE  Render that execution pattern type in codegen mode,
                     splicing the registered resolver's emitted code into the
                     generated body (repeatable); projection operations only
  --observation-altitude NAME  Stream only the named semantic altitude (repeatable:
                     scenario, mechanic, provider, physical); observe only
  --trace            Stream the complete mechanical testimony; observe only.
                     Without it observe is story-first: only the scenario
                     altitude and the declared story stream
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
      'input-type': { type: 'string' },
      as: { type: 'string' }, scenario: { type: 'string' }, namespace: { type: 'string' },
      format: { type: 'string' },
      display: { type: 'boolean' },
      workspace: { type: 'string' }, targets: { type: 'string' }, 'full-mechanics': { type: 'boolean' },
      'codegen-pattern': { type: 'string', multiple: true },
      'observation-altitude': { type: 'string', multiple: true },
      trace: { type: 'boolean' },
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
  const request = { ...parseSemanticCommand(positionals, mapping), as: values.as, format: values.format, display: values.display, inputType: values['input-type'], namespace: values.namespace, observationAltitudes: values['observation-altitude'], workspace: values.workspace, fullMechanics: values['full-mechanics'], codegenPatterns: values['codegen-pattern'],
    targets: values.targets === undefined ? undefined : values.targets.split(',').filter(target => target.length > 0) };
  requireValue(values.scenario === undefined || request.scenario === undefined,
    'OPTION_NOT_APPLICABLE', 'Supply a scenario either positionally or with --scenario.', 2);
  if (values.scenario !== undefined) request.scenario = values.scenario;
  // Story first. The terminal's default observation is the scenario altitude; the
  // declared `observationAltitudes` field is still what scopes the estate stream,
  // and `--trace` asks for the complete mechanical testimony. An explicit
  // altitude selection is already a trace of that altitude.
  const spec = semanticCommand(request.object, request.verb, mapping);
  requireValue(values.trace === undefined || spec?.observation === true,
    'OPTION_NOT_APPLICABLE', '--trace applies only to observation operations.', 2);
  if (spec?.observation === true && values['observation-altitude'] === undefined)
    request.observationAltitudes = values.trace ? [...OBSERVATION_ALTITUDES] : ['scenario'];
  validateSemanticRequest({ ...request, input: values.input }, mapping);
  return { values, request };
}

async function readInput(value, stdin, raw) {
  if (value === undefined) return undefined;
  if (value.startsWith('@')) value = await readFile(value.slice(1), 'utf8');
  else if (value === '-') {
    const chunks = [];
    let size = 0;
    for await (const chunk of stdin) {
      size += Buffer.byteLength(chunk);
      requireValue(size <= 8 * 1024 * 1024, 'INPUT_TOO_LARGE', 'Standard input exceeds 8 MiB.', 2);
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  // A typed-input operation carries the raw scalar; the estate maps it into the
  // contract the capability declares. No JSON parsing, so 'Sidney' needs no quoting.
  if (raw) return value;
  try { return JSON.parse(value.replace(/^\uFEFF/, '')); } catch (error) {
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
    const operationSpec = semanticCommand(request.object, request.verb, mapping);
    // A raw scalar is carried only for a typed-input operation and a bare operand;
    // the '@file' and '-' carriers stay canonical JSON unless a type is named.
    const carrier = typeof values.input === 'string' && (values.input.startsWith('@') || values.input === '-');
    const explicitType = values['input-type'];
    const carryRaw = operationSpec?.inputType === true
      && (explicitType === undefined ? !carrier : explicitType !== 'json');
    request.input = await readInput(values.input, stdin, carryRaw);
    const sidefx = factory({ mapping, deliveries: configuration.deliveries, estateRoot: selectedEstate || configuration.estateRoot,
      timeoutMs: values.timeout === undefined ? undefined : Number(values.timeout) });
    // An operation the mapping declares observable streams its telemetry as the
    // estate reports it. Telemetry is diagnostics: it goes to stderr, never to the
    // result on stdout, and it cannot change the delivered outcome.
    const observed = semanticCommand(request.object, request.verb, mapping)?.observation === true;
    // The story stream's clock is read from the event times the estate already
    // reports: each human entry prints the elapsed wall time since the previous
    // streamed entry, and the completed stream prints its total span. --json
    // keeps the machine stream exactly as delivered.
    const streamClock = createStreamClock();
    let result;
    try {
      result = await sidefx.execute(request, observed ? {
        onObservation(event) { stderr.write(renderObservation(event, json, streamClock.gap(event)) + '\n'); },
      } : {});
    } finally {
      if (observed && !json) {
        const span = streamClock.total();
        if (span) stderr.write(`  Σ streamed span ${span}\n`);
      }
    }
    // `--trace` is a presentation reading, not an estate field: it selects the
    // hierarchical trace after the story and never leaves the terminal.
    stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${render({ ...request, trace: values.trace }, result, mapping)}\n`);
    return 0;
  } catch (error) {
    if (error.code === 'EPIPE') return 0;
    const record = errorRecord(error);
    stderr.write(json ? `${JSON.stringify({ error: record })}\n`
      : `${record.code}: ${record.message}${record.details ? `\n${JSON.stringify(record.details, null, 2)}` : ''}\n`);
    return error.exitCode ?? 4;
  }
}
