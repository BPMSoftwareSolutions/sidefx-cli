import { SidefxError, requireValue } from './errors.mjs';

function document(capsule, reference, required = false) {
  const entry = capsule.entries.find(item => item.entryId === reference || item.entryRef === reference);
  if (!entry) {
    if (required) throw new SidefxError('REPRESENTATION_UNAVAILABLE', `Capsule does not carry ${reference}.`);
    return null;
  }
  const bytes = Buffer.from(entry.entryBytesBase64, 'base64').toString('utf8');
  return { entryRef: entry.entryRef, entryDigest: entry.entryDigest, value: JSON.parse(bytes) };
}

function featureScenarios(children = []) {
  return children.flatMap(child => child.scenario ? [child.scenario] : child.rule ? featureScenarios(child.rule.children) : []);
}

function tag(scenario, prefix) {
  return scenario.tags.find(item => item.name.startsWith(`@${prefix}:`))?.name.slice(prefix.length + 2) ?? null;
}

export function projectCapability({ inspection, capsule, featureDocument }) {
  const authority = document(capsule, 'capability.authority.json', true);
  const blueprint = document(capsule, 'blueprint.authority.json');
  const plan = document(capsule, capsule.runtimeBindings[0].planEntryRef, true);
  requireValue(['consumer-execution-embodiment-plan.v1', 'consumer-execution-embodiment-plan.v2', 'consumer-execution-embodiment-plan.v3'].includes(plan.value.executionEmbodimentPlanType),
    'PLAN_REPRESENTATION_UNSUPPORTED', `Unsupported execution plan ${plan.value.executionEmbodimentPlanType}.`);
  const sourceScenarios = featureScenarios(featureDocument?.feature?.children);
  const nodes = plan.value.nodes ?? [];
  let scenarios = nodes.filter(node => node.scenario).map(node => ({
    ...node.scenario,
    operations: node.operations ?? [],
    transition: node.transition ?? null,
  }));
  const graph = plan.value.canonicalGraph;
  if (graph) {
    scenarios = graph.cells.filter(cell => cell.altitude === 'scenario').map(cell => {
      const source = sourceScenarios.find(scenario => cell.cellId === `cell:scenario:${tag(scenario, 'scenario')}`);
      requireValue(source, 'SCENARIO_AUTHORITY_UNAVAILABLE', `No capsule feature identity corresponds to ${cell.cellId}.`);
      return {
        scenarioId: tag(source, 'scenario'), name: source.name,
        input: { inputId: tag(source, 'input'), contract: { contractId: cell.input.contractId } },
        event: { eventId: tag(source, 'event'), executionAuthorityId: cell.execution.authorityId },
        outcome: { outcomeId: tag(source, 'outcome'), contract: { contractId: cell.outcome.contractId },
          variants: cell.outcome.variants, terminal: source.tags.some(item => item.name === '@outcome-terminal') },
        nativeCell: cell,
        edges: graph.edges.filter(edge => edge.from.cellId === cell.cellId || edge.to.cellId === cell.cellId),
      };
    });
  }
  requireValue(scenarios.length > 0, 'SCENARIO_AUTHORITY_UNAVAILABLE', 'The execution plan exposes no scenario authority.');
  scenarios = scenarios.map(scenario => {
    const source = sourceScenarios.find(item => tag(item, 'scenario') === scenario.scenarioId);
    return { ...scenario, ...(source ? { name: source.name,
      steps: source.steps.map(step => ({ keyword: step.keyword, text: step.text })) } : {}) };
  });
  const mechanics = plan.value.mechanicBindings ?? [];
  const contracts = plan.value.contractCatalog?.contracts
    ?? Object.assign({}, ...mechanics.map(binding => binding.configuration?.contractAuthorities?.contracts ?? {}));
  const providers = graph
    ? (plan.value.realizationOverlay?.providerBindings ?? []).map(binding => ({
      bindingId: binding.slotId, mechanicType: 'graph-provider',
      mechanicId: binding.mechanicId ?? null, providerProfileId: binding.providerProfileId ?? null,
      providerCapabilityId: binding.providerCapabilityId ?? null, provider: binding.provider ?? null,
      nativeBinding: binding,
    }))
    : mechanics.map(({ bindingId, mechanicType, providerCapabilityId, provider }) => ({
      bindingId, mechanicType, providerCapabilityId: providerCapabilityId ?? null, provider: provider ?? null,
    }));
  const feature = capsule.entries.find(entry => entry.entryRef.endsWith(`/${capsule.capabilityId}.feature`))
    ?? capsule.entries.find(entry => /\.feature(?:\.sidefx)?$/.test(entry.entryRef));
  return {
    ...inspection,
    name: authority.value.name ?? capsule.capabilityId,
    userStory: authority.value.userStory ?? null,
    experience: authority.value.experience ?? null,
    rootScenarioId: authority.value.rootScenarioId ?? plan.value.rootNodeId ?? null,
    authority,
    commandBindings: authority.value.commandBindings ?? [],
    scenarios,
    blueprint,
    contracts,
    providers,
    feature: feature ? { entryRef: feature.entryRef, entryDigest: feature.entryDigest,
      text: Buffer.from(feature.entryBytesBase64, 'base64').toString('utf8') } : null,
    plan: { entryRef: plan.entryRef, entryDigest: plan.entryDigest, type: plan.value.executionEmbodimentPlanType },
  };
}

export function revealCapability(capability, { as = 'scenario', scenario } = {}) {
  if (scenario) requireValue(capability.scenarios.some(item => item.scenarioId === scenario),
    'SCENARIO_NOT_FOUND', `No scenario ${scenario} in ${capability.capabilityId}.`);
  if (as === 'blueprint') {
    requireValue(capability.blueprint, 'BLUEPRINT_UNAVAILABLE', 'This capsule does not carry an admitted blueprint.');
    return { ...capability.blueprint, selectedScenarioId: scenario ?? null };
  }
  if (as === 'feature') {
    requireValue(!scenario, 'OPTION_NOT_APPLICABLE', '--scenario applies to scenario and blueprint views.', 2);
    requireValue(capability.feature, 'FEATURE_UNAVAILABLE', 'This capsule does not carry a feature.');
    return capability.feature;
  }
  if (as === 'contracts') {
    requireValue(!scenario, 'OPTION_NOT_APPLICABLE', '--scenario applies to scenario and blueprint views.', 2);
    return { rootScenarioId: capability.rootScenarioId, contracts: capability.contracts };
  }
  requireValue(as === 'scenario', 'FORMAT_REJECTED', 'Use --as scenario, blueprint, feature, or contracts.', 2);
  return { capabilityId: capability.capabilityId, rootScenarioId: capability.rootScenarioId,
    source: capability.plan, scenarios: capability.scenarios.filter(item => !scenario || item.scenarioId === scenario) };
}

// A structural comparison is a view, never semantic equivalence or admission.
export function structuralDiff(left, right, at = '') {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object'
    && Array.isArray(left) === Array.isArray(right)) {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(key =>
      structuralDiff(left[key], right[key], `${at}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  }
  return [{ path: at || '/', kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed',
    ...(left === undefined ? {} : { before: left }), ...(right === undefined ? {} : { after: right }) }];
}
