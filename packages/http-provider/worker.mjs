import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { exchange } from './http.mjs';
import { resolveCredential, redact } from './credentials.mjs';

const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const own = (object, name) => Object.hasOwn(object, name);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (condition, code) => { if (!condition) throw new Error(code); };
const closed = (value, names) => object(value) && Object.keys(value).every(name => names.includes(name));
const headerName = value => typeof value === 'string' && /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(value);
const privateHeader = value => /^(host|connection|content-length|transfer-encoding|authorization|proxy-authorization|cookie|set-cookie)$/i.test(value);

function pointer(value, path) {
  fail(typeof path === 'string' && (path === '' || path.startsWith('/')), 'RESPONSE_CHECK_REJECTED');
  for (const segment of path === '' ? [] : path.slice(1).split('/').map(item => item.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if ((!object(value) && !Array.isArray(value)) || !own(value, segment)) return { present: false };
    value = value[segment];
  }
  return { present: true, value };
}

function validateOperation(operation) {
  fail(closed(operation, ['method', 'origin', 'path', 'headers', 'credential', 'parameters', 'body', 'expectedStatus', 'responseChecks', 'allowLoopbackHttp']), 'OPERATION_DESCRIPTOR_REJECTED');
  fail(['GET', 'POST'].includes(operation.method) && typeof operation.origin === 'string'
    && typeof operation.path === 'string' && operation.path.startsWith('/') && !operation.path.startsWith('//')
    && !/[?#\\]/.test(operation.path), 'OPERATION_DESCRIPTOR_REJECTED');
  const origin = new URL(operation.origin);
  fail(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === '/', 'ENDPOINT_REJECTED');
  fail(origin.protocol === 'https:' || (operation.allowLoopbackHttp === true && origin.protocol === 'http:'
    && ['127.0.0.1', '[::1]'].includes(origin.hostname)), 'ENDPOINT_REJECTED');
  fail(operation.method !== 'GET' || !own(operation, 'body'), 'GET_BODY_REJECTED');
  fail(object(operation.headers) && object(operation.parameters) && Array.isArray(operation.expectedStatus)
    && operation.expectedStatus.length > 0 && operation.expectedStatus.every(status => Number.isInteger(status) && status >= 200 && status < 300)
    && Array.isArray(operation.responseChecks), 'OPERATION_DESCRIPTOR_REJECTED');
  for (const [name, value] of Object.entries(operation.headers)) {
    fail(headerName(name) && !privateHeader(name) && typeof value === 'string' && !/[\r\n\0]/.test(value), 'HEADER_REJECTED');
  }
  if (operation.credential !== null) {
    fail(closed(operation.credential, ['kind', 'name', 'scope', 'header'])
      && operation.credential.kind === 'environment' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(operation.credential.name)
      && ['process', 'user'].includes(operation.credential.scope) && headerName(operation.credential.header)
      && !/^(host|connection|content-length|transfer-encoding|cookie)$/i.test(operation.credential.header)
      && !Object.keys(operation.headers).some(name => name.toLowerCase() === operation.credential.header.toLowerCase()), 'CREDENTIAL_REFERENCE_REJECTED');
  }
  for (const rule of operation.responseChecks) {
    fail(closed(rule, ['pointer', 'type', 'equals', 'equalsParameter']) && typeof rule.pointer === 'string'
      && (rule.pointer === '' || rule.pointer.startsWith('/'))
      && ['string', 'number', 'boolean', 'object', 'array', 'null'].includes(rule.type)
      && (!own(rule, 'equalsParameter') || own(operation.parameters, rule.equalsParameter)), 'RESPONSE_CHECK_REJECTED');
  }
  for (const rule of Object.values(operation.parameters)) {
    fail(closed(rule, ['default', 'pattern', 'enum']) && typeof rule.default === 'string' && rule.default.length <= 2048
      && (!rule.pattern || typeof rule.pattern === 'string')
      && (!rule.enum || (Array.isArray(rule.enum) && rule.enum.every(item => typeof item === 'string'))), 'PARAMETER_DESCRIPTOR_REJECTED');
    if (rule.pattern) new RegExp(rule.pattern, 'u');
  }
  return new URL(operation.path, origin);
}

async function evaluate(input, config, configDigest) {
  fail(closed(input, ['contractId', 'command']) && input.contractId === 'sfx-semantic-command.v1'
    && closed(input.command, ['object', 'verb', 'subject', 'input', 'via'])
    && input.command.object === 'provider' && input.command.verb === 'evaluate'
    && typeof input.command.subject === 'string', 'INPUT_CONTRACT_REJECTED');
  fail(config.configurationType === 'sfx-http-provider-config.v1' && object(config.providers)
    && Number.isInteger(config.timeoutMs) && config.timeoutMs > 0 && config.timeoutMs <= 30000
    && Number.isInteger(config.maxResponseBytes) && config.maxResponseBytes > 0 && config.maxResponseBytes <= 1048576,
  'PROVIDER_CONFIGURATION_REJECTED');
  const providerId = input.command.subject;
  fail(own(config.providers, providerId), 'PROVIDER_NOT_CONFIGURED');
  const provider = config.providers[providerId];
  const selection = input.command.input ?? {};
  fail(closed(selection, ['operation', 'parameters']) && (selection.parameters === undefined || object(selection.parameters)), 'INPUT_CONTRACT_REJECTED');
  const operationId = selection.operation ?? provider.defaultOperation;
  fail(object(provider.operations) && typeof operationId === 'string' && own(provider.operations, operationId), 'OPERATION_NOT_CONFIGURED');
  const operation = provider.operations[operationId];
  const url = validateOperation(operation);
  const overrides = selection.parameters ?? {};
  fail(Object.keys(overrides).every(name => own(operation.parameters, name)), 'PARAMETER_NOT_DECLARED');
  const parameters = {};
  for (const [name, rule] of Object.entries(operation.parameters)) {
    const value = own(overrides, name) ? overrides[name] : rule.default;
    fail(typeof value === 'string' && value.length <= 2048 && (!rule.pattern || new RegExp(rule.pattern, 'u').test(value))
      && (!rule.enum || rule.enum.includes(value)), 'PARAMETER_REJECTED');
    parameters[name] = value;
    url.searchParams.append(name, value);
  }
  const base = { resultType: 'sfx-http-provider-evaluation.v1', scope: 'DECLARED_OPERATION_SMOKE_TEST',
    providerId, operationId, descriptorDigest: sha(Buffer.from(JSON.stringify(operation))), configurationDigest: configDigest,
    request: { method: operation.method, url: url.href, credentialReference: operation.credential
      ? { kind: operation.credential.kind, name: operation.credential.name, scope: operation.credential.scope } : null },
    admission: 'NOT_CLAIMED', interchangeability: 'NOT_EVALUATED' };
  let credential;
  try { credential = await resolveCredential(operation.credential); }
  catch (error) { return { ...base, disposition: error.message, observation: { attemptCount: 0, httpStatus: null } }; }
  const headers = { ...operation.headers };
  if (credential) headers[operation.credential.header] = credential;
  const observation = await exchange({ url, method: operation.method, headers,
    body: operation.method === 'POST' ? JSON.stringify(operation.body ?? {}) : undefined,
    timeoutMs: config.timeoutMs, maxResponseBytes: config.maxResponseBytes });
  const { bodyText, ...safeObservation } = observation;
  if (bodyText === undefined) return redact({ ...base, disposition: observation.transportDisposition, observation: safeObservation }, credential);
  let body;
  let jsonValid = false;
  try { body = JSON.parse(bodyText); jsonValid = true; } catch { /* Preserve transport evidence without treating an HTML/error page as JSON. */ }
  const statusPassed = operation.expectedStatus.includes(observation.httpStatus);
  const checks = jsonValid && statusPassed ? operation.responseChecks.map(rule => {
    const selected = pointer(body, rule.pointer);
    const type = selected.value === null ? 'null' : Array.isArray(selected.value) ? 'array' : typeof selected.value;
    return { pointer: rule.pointer, expectedType: rule.type, passed: selected.present && type === rule.type
      && (!own(rule, 'equals') || JSON.stringify(selected.value) === JSON.stringify(rule.equals))
      && (!own(rule, 'equalsParameter') || selected.value === parameters[rule.equalsParameter]) };
  }) : [];
  const disposition = !statusPassed ? 'HTTP_REJECTED' : !jsonValid ? 'RESPONSE_NOT_JSON'
    : checks.some(check => !check.passed) ? 'RESPONSE_CHECK_FAILED' : 'PASSED';
  const result = redact({ ...base, disposition, observation: safeObservation,
    validation: { expectedStatus: operation.expectedStatus, statusPassed, jsonValid, checks,
      responseCoverage: checks.length ? 'DECLARED_FIELDS_ONLY' : 'JSON_SYNTAX_ONLY' },
    response: jsonValid ? body : null }, credential);
  credential = undefined;
  return result;
}

let capabilityId = null;
try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; fail(size <= 8 * 1024 * 1024, 'INPUT_LIMIT_EXCEEDED'); chunks.push(chunk); }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const authorityBytes = await readFile(new URL('./capability.json', import.meta.url));
  const authority = JSON.parse(authorityBytes);
  capabilityId = authority.capabilityId;
  fail(request.protocol === 'sfx-runtime-request.v1' && request.capabilityId === capabilityId
    && request.capabilityAuthorityDigest === sha(authorityBytes), 'AUTHORITY_IDENTITY_REJECTED');
  const configBytes = await readFile(process.argv[2]);
  const result = await evaluate(request.input, JSON.parse(configBytes.toString('utf8').replace(/^\uFEFF/, '')), sha(configBytes));
  process.stdout.write(JSON.stringify({ protocol: 'sfx-runtime-response.v1', capabilityId, result }));
} catch (error) {
  const code = /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'PROVIDER_INPUT_OR_CONFIGURATION_REJECTED';
  process.stdout.write(JSON.stringify({ protocol: 'sfx-runtime-response.v1', capabilityId,
    error: { code, message: code } }));
}
