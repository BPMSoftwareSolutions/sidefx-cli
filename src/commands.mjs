import { requireValue } from './errors.mjs';
import { isCapabilityId, isProviderId } from './catalog.mjs';
import { isExecutionId } from './receipts.mjs';
import { readFile } from 'node:fs/promises';
import { bytesDigest } from './data.mjs';

const local = (projection, min = 1, options = {}) => Object.freeze({ projection, min, max: min, ...options });
const delegated = (min = 1, options = {}) => local(null, min, { bindable: true, ...options });
const query = { query: true, max: Infinity };
const bindable = { bindable: true };
const comparison = local('compare', 2, bindable);

// Entity types select syntax and adapters. Instance identities and domain data do not.
export const defaultVocabulary = {
  provider: {
    list: local('providers', 0, bindable), search: local('provider-search', 0, { ...query, ...bindable }),
    find: local('provider-search', 1, { ...query, ...bindable }),
    inspect: local('inspect', 1, bindable), compare: comparison,
    add: local('reference'), remove: local('reference'),
    discover: delegated(), evaluate: delegated(), admit: delegated(),
    assimilate: delegated(), configure: delegated(), publish: delegated(),
  },
  capability: {
    list: local('capabilities', 0, bindable), search: local('capability-search', 0, { ...query, ...bindable }),
    find: local('capability-search', 1, { ...query, ...bindable }), inspect: local('inspect'),
    providers: local('providers-for-capability'), scenarios: local('scenarios'),
    reveal: local('reveal'), resolve: local('resolve', 1, bindable),
    invoke: local('invoke'), evaluate: local('evaluate', 1, bindable), compare: comparison,
    author: delegated(), admit: delegated(), install: delegated(), publish: delegated(), govern: delegated(),
  },
  scenario: {
    list: local('scenarios'), inspect: local('scenario', 2, { scenarioOperand: true }),
    reveal: local('scenario', 2, { scenarioOperand: true }),
  },
  capsule: {
    list: local('capabilities', 0), inspect: local('inspect'), reveal: local('reveal'),
    evaluate: local('evaluate', 1, bindable), compare: comparison,
    admit: delegated(), publish: delegated(),
  },
  execution: {
    list: local('executions', 0), inspect: local('observe'), observe: local('observe'),
    explain: local('explain'), compare: local('compare', 2),
  },
  estate: { inspect: local('verify', 0), verify: local('verify', 0) },
  profile: {
    list: delegated(0), search: delegated(0, query), inspect: delegated(),
    resolve: delegated(), evaluate: delegated(),
  },
  evidence: {
    list: local('executions', 0), inspect: local('observe'), observe: local('observe'),
    explain: local('explain'), compare: local('compare', 2),
  },
};

const requestFields = new Set(['object', 'verb', 'subject', 'other', 'query', 'scenario', 'as', 'via', 'input', 'namespace']);

export async function loadCommandSurface(file) {
  const bytes = await readFile(file);
  const document = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  requireValue(document.commandSurfaceType === 'sfx-command-surface.v1' && document.objects
    && !Array.isArray(document.objects) && typeof document.objects === 'object'
    && Object.keys(document).every(key => ['commandSurfaceType', 'objects'].includes(key)),
  'COMMAND_SURFACE_REJECTED', 'Expected sfx-command-surface.v1 with declared objects and operations.', 2);
  const vocabulary = Object.fromEntries(Object.entries(defaultVocabulary).map(([object, operations]) => [object, { ...operations }]));
  for (const [object, operations] of Object.entries(document.objects)) {
    requireValue(/^[a-z][a-z0-9-]*$/.test(object) && !['constructor', 'prototype'].includes(object)
      && operations && typeof operations === 'object' && !Array.isArray(operations),
    'COMMAND_SURFACE_REJECTED', 'Invalid entity type declaration.', 2);
    vocabulary[object] ??= {};
    for (const [verb, spec] of Object.entries(operations)) {
      requireValue(/^[a-z][a-z0-9-]*$/.test(verb) && !['constructor', 'prototype'].includes(verb)
        && spec && Object.keys(spec).every(key => ['min', 'max', 'query', 'namespace', 'binding', 'result', 'description'].includes(key))
        && Number.isInteger(spec.min) && spec.min >= 0 && spec.min <= 2
        && (spec.max === null ? spec.query === true : Number.isInteger(spec.max) && spec.max >= spec.min && spec.max <= 2)
        && (spec.query === undefined || typeof spec.query === 'boolean')
        && (spec.namespace === undefined || typeof spec.namespace === 'boolean')
        && (spec.result === undefined || ['execution', 'representation'].includes(spec.result)),
      'COMMAND_SURFACE_REJECTED', `Invalid operation declaration: ${object} ${verb}.`, 2);
      if (spec.binding) requireValue(Object.keys(spec.binding).every(key => ['capabilityId', 'capsuleDigest', 'authorityDigest'].includes(key))
        && isCapabilityId(spec.binding.capabilityId)
        && ['capsuleDigest', 'authorityDigest'].filter(key => Object.hasOwn(spec.binding, key)).length === 1
        && /^sha256:[a-f0-9]{64}$/.test(spec.binding.capsuleDigest ?? spec.binding.authorityDigest),
      'COMMAND_SURFACE_REJECTED', 'Command bindings require a capability and one exact authority pin.', 2);
      vocabulary[object][verb] = Object.freeze({ ...spec, max: spec.max ?? Infinity, bindable: true, declared: true, projection: null });
    }
  }
  return { vocabulary, digest: bytesDigest(bytes), file };
}

export const isSemanticObject = (object, vocabulary = defaultVocabulary) => typeof object === 'string' && Object.hasOwn(vocabulary, object);
export function semanticCommand(object, verb, vocabulary = defaultVocabulary) {
  return isSemanticObject(object, vocabulary) && typeof verb === 'string' && Object.hasOwn(vocabulary[object], verb)
    ? vocabulary[object][verb] : null;
}

export function parseSemanticCommand([object, verb, ...operands], vocabulary = defaultVocabulary) {
  const spec = semanticCommand(object, verb, vocabulary);
  requireValue(spec, 'COMMAND_REJECTED', `Unknown operation for ${object}. Run sfx --help.`, 2);
  requireValue(operands.length >= spec.min && operands.length <= spec.max,
    'USAGE_ERROR', `Wrong operands for sfx ${object} ${verb}. Run sfx --help.`, 2);
  if (spec.query) return { object, verb, query: operands.join(' ') };
  return { object, verb, subject: operands[0], ...(spec.scenarioOperand
    ? { scenario: operands[1] } : operands.length === 2 ? { other: operands[1] } : {}) };
}

export function validateSemanticRequest(request, { routes = false, vocabulary = defaultVocabulary } = {}) {
  requireValue(Reflect.ownKeys(request).every(field => requestFields.has(field)), 'REQUEST_FIELD_REJECTED',
    'Use the canonical command fields; entity-specific data belongs inside input.', 2);
  const { object, verb, subject, other } = request;
  const spec = semanticCommand(object, verb, vocabulary);
  requireValue(spec, 'COMMAND_REJECTED', `Unknown ${object} operation ${verb}. Run sfx --help.`, 2);
  const hasIdentity = value => typeof value === 'string' && value.length > 0;
  requireValue(spec.query ? (request.query === undefined && spec.min === 0)
    || (typeof request.query === 'string' && (!spec.min || request.query.length > 0))
    : spec.min ? hasIdentity(subject) : subject === undefined,
  'USAGE_ERROR', `Invalid operands for sfx ${object} ${verb}.`, 2);
  requireValue(spec.query ? subject === undefined : true, 'USAGE_ERROR', 'Search uses query, not subject.', 2);
  requireValue(spec.query || request.query === undefined, 'USAGE_ERROR', 'Query applies only to search/find.', 2);
  requireValue(spec.max === 2 && !spec.scenarioOperand ? hasIdentity(other) : other === undefined,
    'USAGE_ERROR', 'A second identity applies only to comparison.', 2);
  if (spec.scenarioOperand) requireValue(hasIdentity(request.scenario), 'USAGE_ERROR', 'Supply capability and scenario identities.', 2);
  if (!spec.query && spec.min && !spec.declared) {
    const identities = other === undefined ? [subject] : [subject, other];
    if (object === 'provider' && verb !== 'discover') requireValue(identities.every(isProviderId),
      'PROVIDER_ID_REJECTED', 'Use the exact provider identity declared by the estate.', 2);
    if (['capability', 'capsule', 'scenario'].includes(object)) requireValue(identities.every(isCapabilityId),
      'CAPABILITY_ID_REJECTED', 'Use exact capability identities.', 2);
    if (['execution', 'evidence'].includes(object)) requireValue(identities.every(isExecutionId),
      'EXECUTION_ID_REJECTED', 'Use retained execution identities.', 2);
  }
  requireValue(request.as === undefined || spec.projection === 'reveal',
    'OPTION_NOT_APPLICABLE', '--as applies to capability/capsule reveal.', 2);
  requireValue(request.scenario === undefined || spec.scenarioOperand || spec.projection === 'reveal',
    'OPTION_NOT_APPLICABLE', 'Scenario selection applies to scenario inspection or capability/capsule reveal.', 2);
  requireValue(!request.via || spec.bindable, 'OPTION_NOT_APPLICABLE', '--via requires a delegated operation.', 2);
  requireValue(request.input === undefined || spec.bindable || spec.projection === 'invoke',
    'OPTION_NOT_APPLICABLE', '--input applies only to capability execution or delegated operations.', 2);
  requireValue(request.namespace === undefined || ((spec.declared ? spec.namespace : object === 'provider' && ['search', 'find'].includes(verb))
    && typeof request.namespace === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(request.namespace)
    && !request.via && !routes && request.input === undefined),
  'OPTION_NOT_APPLICABLE', '--namespace filters local provider search; delegated scope belongs in canonical input.', 2);
  return spec;
}

// Reuse existing mechanics; the caller retains the declared entity type for dispatch.
export function projectSemanticRequest(request, vocabulary = defaultVocabulary) {
  const spec = semanticCommand(request.object, request.verb, vocabulary);
  if (!spec?.projection) return request;
  const projected = { ...request, object: undefined };
  switch (spec.projection) {
    case 'providers': return { ...projected, verb: 'list', subject: 'providers' };
    case 'capabilities': return { ...projected, verb: 'list', subject: 'capabilities' };
    case 'executions': return { ...projected, verb: 'list', subject: 'executions' };
    case 'provider-search': return { ...projected, verb: 'search', subject: request.namespace ?? null };
    case 'capability-search': return { ...projected, verb: 'find', subject: request.query };
    case 'reference': return { ...projected, verb: 'provider', action: request.verb };
    case 'providers-for-capability': return { ...projected, verb: 'providers' };
    case 'scenario': return { ...projected, verb: 'reveal', as: 'scenario' };
    default: return { ...projected, verb: spec.projection };
  }
}
