import { projectSemanticRequest } from './commands.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const safe = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const section = (name, value) => `${name}\n${'-'.repeat(name.length)}\n${value}`;
const list = (values, format = value => value) => values.length ? values.map(format).join('\n') : '(none)';

function scenarioText(scenario) {
  const meaning = scenario.steps?.map(step => `  ${step.keyword.trim()} ${step.text}`).join('\n');
  return `${scenario.scenarioId}\n  GIVEN  INPUT    ${scenario.input?.inputId ?? '(undeclared)'}\n  WHEN   EVENT    ${scenario.event?.eventId ?? '(undeclared)'}\n  THEN   OUTCOME  ${scenario.outcome?.outcomeId ?? '(undeclared)'}${meaning ? `\n\n${meaning}` : ''}`;
}

function mechanicSummary(providers) {
  const counts = new Map();
  for (const provider of providers) {
    const key = [
      provider.providerCapabilityId && `provider capability ${provider.providerCapabilityId}`,
      provider.mechanicId && `mechanic ${provider.mechanicId}`,
      provider.providerProfileId && `profile ${provider.providerProfileId}`,
    ].filter(Boolean).join(' | ') || '(undeclared)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list([...counts], ([id, count]) => `${id}  (${count} binding${count === 1 ? '' : 's'})`);
}

function format(request, value) {
  if (Array.isArray(value.result)) return section('Capabilities', list(value.result,
    item => `${item.capabilityId}  ${item.capabilityVersion}  ${item.target}`));
  if (value.providerId && request.verb === 'inspect') return [
    section('Provider', `${value.name ?? value.providerId}\n${value.providerId}`),
    section('Evidence scope', value.evidenceScope),
    section('Source', pretty(value.source ?? { disposition: 'DESCRIPTOR_NOT_OBSERVED' })),
    section('Declared operations', list(value.operations, item => typeof item === 'string' ? item : pretty(item))),
    section('Candidate capabilities', list(value.candidateCapabilities)),
    section('Transport', pretty(value.transport ?? 'NOT_OBSERVED')),
    section('Conformance claims (testimony)', pretty(value.conformanceClaims ?? 'NOT_OBSERVED')),
  ].join('\n\n');
  if (request.verb === 'inspect' && value.capabilityId) return [
    section('Capability', `${value.name}\n${value.capabilityId}  ${value.capabilityVersion}`),
    section('Intent', value.userStory?.intent ?? '(not declared)'),
    section('Experience', value.experience?.promise ?? '(not declared)'),
    section('Scenarios', list(value.scenarios, scenario => scenario.scenarioId)),
    section('Bound mechanics', mechanicSummary(value.providers)),
    section('Authority', `${value.capsuleDigest}\n${value.capabilityAuthorityDigest}`),
    'Use sfx capability reveal <capability> --as contracts to inspect canonical input.',
  ].join('\n\n');
  if (request.verb === 'scenarios') return section('Scenarios', list(value.scenarios, item => item.scenarioId));
  if (request.verb === 'reveal' && value.scenarios) return list(value.scenarios, scenarioText);
  if (request.verb === 'reveal' && value.text) return value.text.trimEnd();
  if (request.verb === 'resolve' && value.resolutionScope) return [
    section('Resolved capability', `${value.result.inspection.capabilityId}\n${value.result.inspection.capsuleDigest}`),
    section('Resolution scope', value.resolutionScope),
    section('Estate dependency closure', pretty(value.result.dependencyResolution)),
  ].join('\n\n');
  if (value.providers && request.verb === 'search') return section(`Discovery: ${value.namespace ?? 'all configured providers'}`, list(value.providers,
    provider => `${provider.providerId}  ${provider.name}  [${provider.source.kind}]`));
  if (value.executionId && value.executionState && request.verb !== 'observe' && request.verb !== 'explain') return [
    `Execution ${value.executionId}`, `Delivery ${value.executionState}`, section('Canonical result', pretty(value.result)),
    `Evidence ${value.receiptDigest}`, `Observe: sfx execution observe ${value.executionId}`,
  ].join('\n\n');
  return pretty(value);
}

export function render(request, value) {
  return safe(format(request.object ? projectSemanticRequest(request) : request, value));
}
