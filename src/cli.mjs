import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createSidefx } from './index.mjs';
import { readJson } from './data.mjs';
import { requireValue, SidefxError, errorRecord } from './errors.mjs';
import { render } from './render.mjs';

export const help = `SideFX terminal — sfx
Operate capabilities through the existing estate authority.

  sfx list [capabilities|providers|executions]
  sfx find <query>
  sfx search <estate|namespace> <query>
  sfx inspect <capability|namespace/provider>
  sfx scenarios <capability>
  sfx reveal <capability> [--scenario ID] [--as scenario|blueprint|feature|contracts]
  sfx providers <capability>
  sfx resolve <capability>
  sfx evaluate <capability>
  sfx invoke <capability> --input @request.json
  sfx observe <execution-id>
  sfx explain <execution-id>
  sfx compare <capability|provider|execution> <capability|provider|execution>
  sfx provider add|remove <namespace/provider>
  sfx provider list
  sfx verify

Delegated actions (exact canonical input, no local business rules):
  sfx evaluate|assimilate|author|resolve|install|publish|govern <subject>
      --via <capability-id> --input @request.json
  sfx compare <left> <right> --via <capability-id> --input @request.json
  Use --routes FILE instead of --via for bindings pinned to capsule digests.

Options:
  --estate PATH       Estate with its installed sda-bootstrap (or SIDEFX_ESTATE)
  --state PATH        Local receipts and provider references (or SIDEFX_HOME)
  --catalog FILE      Provider discovery catalog; repeat for multiple files
  --routes FILE       Explicit verb-to-capability bindings
  --input VALUE      Canonical JSON, @file.json, or - for standard input
  --json             Machine-readable JSON; diagnostics remain on stderr
  --timeout MS       Runtime timeout in milliseconds (default 120000)
  --help, -h         Show this help
  --version          Show the version

evaluate <capability> runs its existing fixtures. Provider evaluation requires
a capability binding. Catalogs and registered references confer no admission.
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
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    } });
  } catch (error) { throw new SidefxError('USAGE_ERROR', error.message, 2); }
  const { values, positionals } = parsed;
  if (values.help || values.version || positionals.length === 0) return { values, help: !values.version, version: values.version };
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
  if (values.timeout !== undefined) requireValue(/^\d+$/.test(values.timeout) && Number(values.timeout) > 0
    && Number(values.timeout) <= 2_147_483_647, 'INVALID_TIMEOUT', '--timeout must be a positive integer below 2147483648.', 2);
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
