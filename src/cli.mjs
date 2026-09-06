import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createSidefx } from './index.mjs';
import { readJson } from './data.mjs';
import { requireValue, SidefxError, errorRecord } from './errors.mjs';
import { render } from './render.mjs';
import { isSemanticObject, parseSemanticCommand, validateSemanticRequest } from './commands.mjs';

export const help = `SideFX terminal — sfx
Speak the SideFX capability model: sfx <object> <operation> [identity].
Entity Neutrality: types select operations; identities and domain values are data.

  sfx provider list
  sfx provider search [query] [--namespace NAME]
  sfx provider inspect|add|remove <namespace/provider>
  sfx provider compare <provider> <provider>
  sfx capability list
  sfx capability search [query]
  sfx capability find <query>
  sfx capability inspect|providers|scenarios|resolve|evaluate <capability>
  sfx capability invoke <capability> --input @request.json
  sfx capability compare <capability> <capability>
  sfx capability reveal <capability> [--scenario ID] [--as VIEW]
  sfx scenario list <capability>
  sfx scenario inspect|reveal <capability> <scenario>
  sfx capsule list
  sfx capsule inspect|evaluate <capability>
  sfx capsule reveal <capability> [--scenario ID] [--as VIEW]
  sfx capsule compare <capability> <capability>
  sfx execution list
  sfx execution inspect|observe|explain <execution-id>
  sfx execution compare <execution-id> <execution-id>
  sfx estate inspect|verify
  sfx evidence list
  sfx evidence inspect|observe|explain <execution-id>
  sfx evidence compare <execution-id> <execution-id>

Managed operations require an explicit capability binding and canonical input:
  sfx provider discover <source>
  sfx provider evaluate|admit|assimilate|configure|publish <provider>
  sfx capability author|admit|install|publish|govern <capability>
  sfx capsule admit|publish <capability>
  sfx profile list
  sfx profile search [query]
  sfx profile inspect|resolve|evaluate <profile>
      --via <capability-id> --input @request.json
  Provider search/inspect, capability resolve/evaluate, capsule evaluate and
  provider/capability/capsule compare can also delegate with --via and --input.
  Use --routes FILE for object/operation bindings pinned to capsule digests (v2).

Compatibility: existing verb-first forms remain, including sfx invoke, inspect,
  find, search, reveal, evaluate, observe, explain, compare, list and verify.

Options:
  --estate PATH       Estate with its installed sda-bootstrap (or SIDEFX_ESTATE)
  --state PATH        Local receipts and provider references (or SIDEFX_HOME)
  --catalog FILE      Provider discovery catalog; repeat for multiple files
  --namespace NAME    Optional namespace filter for local provider search
  --routes FILE       Explicit verb-to-capability bindings
  --input VALUE      Canonical JSON, @file.json, or - for standard input
  --as VIEW          scenario, blueprint, feature, or contracts for reveal
  --scenario ID      Select a scenario for reveal
  --json             Machine-readable JSON; diagnostics remain on stderr
  --timeout MS       Runtime timeout in milliseconds (default 120000)
  --help, -h         Show this help
  --version          Show the version

capability evaluate runs existing fixtures. Provider evaluation and admission
require capability bindings. Catalogs and registered references confer no admission.
Entity-specific configuration belongs in canonical data, never instance-specific flags.
Exit 0 means delivery completed; inspect the returned domain disposition.
Exit 2: usage/input. Exit 3: unavailable boundary. Exit 4: runtime/integrity.
`;

export function parseCommand(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      estate: { type: 'string' }, state: { type: 'string' }, catalog: { type: 'string', multiple: true },
      routes: { type: 'string' }, input: { type: 'string' }, via: { type: 'string' },
      as: { type: 'string' }, scenario: { type: 'string' }, timeout: { type: 'string' },
      namespace: { type: 'string' },
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    } });
  } catch (error) { throw new SidefxError('USAGE_ERROR', error.message, 2); }
  const { values, positionals } = parsed;
  if (values.help || values.version || positionals.length === 0) return { values, help: !values.version, version: values.version };
  if (values.timeout !== undefined) requireValue(/^\d+$/.test(values.timeout) && Number(values.timeout) > 0
    && Number(values.timeout) <= 2_147_483_647, 'INVALID_TIMEOUT', '--timeout must be a positive integer below 2147483648.', 2);
  if (isSemanticObject(positionals[0])) {
    const request = { ...parseSemanticCommand(positionals), as: values.as, via: values.via, namespace: values.namespace };
    requireValue(values.scenario === undefined || request.scenario === undefined,
      'OPTION_NOT_APPLICABLE', 'Supply a scenario either positionally or with --scenario.', 2);
    if (values.scenario !== undefined) request.scenario = values.scenario;
    const spec = validateSemanticRequest({ ...request, input: values.input }, { routes: Boolean(values.routes) });
    requireValue(!values.routes || spec.bindable, 'OPTION_NOT_APPLICABLE', '--routes requires a delegated operation.', 2);
    return { values, request };
  }
  requireValue(values.namespace === undefined, 'OPTION_NOT_APPLICABLE', '--namespace applies to provider search.', 2);
  const [verb, ...operands] = positionals;
  const request = { verb };
  const arity = (min, max = min) => requireValue(operands.length >= min && operands.length <= max,
    'USAGE_ERROR', `Wrong operands for sfx ${verb}. Run sfx --help.`, 2);
  switch (verb) {
    case 'list': arity(0, 1); request.subject = operands[0] ?? 'capabilities'; break;
    case 'find': arity(1, Infinity); request.subject = operands.join(' '); break;
    case 'search': arity(2, Infinity); request.subject = operands[0]; request.query = operands.slice(1).join(' '); break;
    case 'compare': arity(2); [request.subject, request.other] = operands; break;
    case 'provider':
      request.action = operands[0];
      arity(request.action === 'list' ? 1 : 2);
      request.subject = operands[1];
      break;
    case 'verify': arity(0); break;
    case 'evaluate':
      if (operands[0] === 'provider') { arity(2); request.subject = operands[1]; request.provider = true; }
      else { arity(1); request.subject = operands[0]; }
      break;
    case 'inspect': case 'reveal': case 'scenarios': case 'providers': case 'resolve':
    case 'invoke': case 'observe': case 'explain': case 'assimilate': case 'author':
    case 'install': case 'publish': case 'govern':
      arity(1); request.subject = operands[0]; break;
    default: throw new SidefxError('COMMAND_REJECTED', `Unknown command ${verb}. Run sfx --help.`, 2);
  }
  requireValue(!(values.as || values.scenario) || verb === 'reveal',
    'OPTION_NOT_APPLICABLE', '--as and --scenario apply to reveal.', 2);
  requireValue(!values.via || ['evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'].includes(verb),
    'OPTION_NOT_APPLICABLE', '--via requires a delegated action.', 2);
  requireValue(values.input === undefined || ['invoke', 'evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'].includes(verb),
    'OPTION_NOT_APPLICABLE', '--input applies only to capability execution.', 2);
  requireValue(!values.routes || ['evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'].includes(verb),
    'OPTION_NOT_APPLICABLE', '--routes applies only to delegated actions.', 2);
  return { values, request: { ...request, as: values.as, scenario: values.scenario, via: values.via } };
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
  try { return JSON.parse(value.replace(/^\uFEFF/, '')); } catch (error) {
    throw new SidefxError('INPUT_JSON_REJECTED', `Input must be valid JSON: ${error.message}`, 2);
  }
}

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr, stdin = process.stdin, factory = createSidefx } = {}) {
  let json = argv.includes('--json');
  try {
    const parsed = parseCommand(argv);
    json = parsed.values.json;
    if (parsed.version) {
      const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
      stdout.write(json ? `${JSON.stringify({ name: 'sfx', version })}\n` : `sfx ${version}\n`);
      return 0;
    }
    if (parsed.help) { stdout.write(json ? `${JSON.stringify({ command: 'sfx', help })}\n` : help); return 0; }
    const { values, request } = parsed;
    request.input = await readInput(values.input, stdin);
    const sidefx = factory({ estateRoot: values.estate, stateRoot: values.state,
      catalogPaths: values.catalog, routesPath: values.routes,
      timeoutMs: values.timeout === undefined ? undefined : Number(values.timeout) });
    const result = await sidefx.execute(request);
    stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${render(request, result)}\n`);
    return 0;
  } catch (error) {
    if (error.code === 'EPIPE') return 0;
    const record = errorRecord(error);
    stderr.write(json ? `${JSON.stringify({ error: record })}\n`
      : `${record.code}: ${record.message}${record.details ? `\n${JSON.stringify(record.details, null, 2)}` : ''}\n`);
    return error.exitCode ?? 4;
  }
}
