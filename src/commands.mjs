import { requireValue } from './errors.mjs';
import { isCapabilityId, isProviderId } from './catalog.mjs';
import { isExecutionId } from './receipts.mjs';

const local = (projection, min = 1, options = {}) => Object.freeze({ projection, min, max: min, ...options });
const delegated = (min = 1, options = {}) => local(null, min, { bindable: true, ...options });
const query = { query: true, max: Infinity };
const bindable = { bindable: true };
const comparison = local('compare', 2, bindable);

// Entity types select syntax and adapters. Instance identities and domain data do not.
const vocabulary = {
  provider: {
    list: local('providers', 0), search: local('provider-search', 0, { ...query, ...bindable }),
    inspect: local('inspect', 1, bindable), compare: comparison,
    add: local('reference'), remove: local('reference'),
    discover: delegated(), evaluate: delegated(), admit: delegated(),
    assimilate: delegated(), configure: delegated(), publish: delegated(),
  },
  capability: {
    list: local('capabilities', 0), search: local('capability-search', 0, query),
    find: local('capability-search', 1, query), inspect: local('inspect'),
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

export const isSemanticObject = object => typeof object === 'string' && Object.hasOwn(vocabulary, object);
export function semanticCommand(object, verb) {
  return isSemanticObject(object) && typeof verb === 'string' && Object.hasOwn(vocabulary[object], verb)
    ? vocabulary[object][verb] : null;
}

export function parseSemanticCommand([object, verb, ...operands]) {
  const spec = semanticCommand(object, verb);
  requireValue(spec, 'COMMAND_REJECTED', `Unknown operation for ${object}. Run sfx --help.`, 2);
  requireValue(operands.length >= spec.min && operands.length <= spec.max,
    'USAGE_ERROR', `Wrong operands for sfx ${object} ${verb}. Run sfx --help.`, 2);
  if (spec.query) return { object, verb, query: operands.join(' ') };
  return { object, verb, subject: operands[0], ...(spec.scenarioOperand
    ? { scenario: operands[1] } : operands.length === 2 ? { other: operands[1] } : {}) };
}

export function validateSemanticRequest(request, { routes = false } = {}) {
  requireValue(Reflect.ownKeys(request).every(field => requestFields.has(field)), 'REQUEST_FIELD_REJECTED',
    'Use the canonical command fields; entity-specific data belongs inside input.', 2);
  const { object, verb, subject, other } = request;
  const spec = semanticCommand(object, verb);
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
  if (!spec.query && spec.min) {
    const identities = other === undefined ? [subject] : [subject, other];
    if (object === 'provider' && verb !== 'discover') requireValue(identities.every(isProviderId),
      'PROVIDER_ID_REJECTED', 'Provider identities use namespace/name.', 2);
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
  requireValue(request.namespace === undefined || (object === 'provider' && verb === 'search'
    && typeof request.namespace === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(request.namespace)
    && !request.via && !routes && request.input === undefined),
  'OPTION_NOT_APPLICABLE', '--namespace filters local provider search; delegated scope belongs in canonical input.', 2);
  return spec;
}

// Reuse existing mechanics; the caller retains the declared entity type for dispatch.
export function projectSemanticRequest(request) {
  const spec = semanticCommand(request.object, request.verb);
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
