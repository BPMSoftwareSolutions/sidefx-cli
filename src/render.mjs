import { semanticCommand } from './commands.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const safe = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const section = (name, value) => `${name}\n${'-'.repeat(name.length)}\n${value}`;
const list = (values, format = value => value) => values.length ? values.map(format).join('\n') : '(none)';

// Rendering is presentation over a canonical estate result. It reshapes nothing and
// recalculates no disposition, so an unrecognised shape is shown verbatim.
function rows(payload) {
  for (const value of [payload, payload?.capabilities, payload?.catalogue?.capabilities, payload?.result, payload?.items]) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

const duration = value => typeof value === 'number'
  ? (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`) : '';

// A streamed testimony item that carries its declared semantic address prints in
// the capability's own language: scenario, responsibility, mechanic. The address
// is estate data; only this presentation is the terminal's.
function semanticLine(when, event) {
  const mechanic = [event.mechanicId, event.mechanicPath].filter(Boolean).join(' ');
  const label = event.semanticRole === 'SCENARIO_OUTCOME' ? `scenario ${event.scenarioId}`
    : event.semanticRole === 'MECHANIC' ? mechanic || event.cellId
      : event.responsibilityKind === 'invoke-scenario' ? `scenario ${event.childScenarioId ?? event.responsibilityId}`
        : event.responsibilityId ?? event.cellId ?? event.edgeId;
  // An edge is the admission path into the addressed cell, not the cell itself.
  const isEdge = typeof event.edgeId === 'string';
  const admission = isEdge && typeof event.admissionDisposition === 'string' ? event.admissionDisposition : '';
  const mark = isEdge ? '↳' : event.semanticRole === 'MECHANIC' ? '·' : '✓';
  return [' ', mark, when, label, admission, duration(event.durationMilliseconds)].filter(Boolean).join(' ');
}

// Telemetry is shown as the estate reported it. No field is derived, renamed or
// inferred here, and an event carrying none of these fields prints as itself.
export function renderObservation(event, json = false) {
  if (json) return JSON.stringify({ observation: event });
  const when = typeof event?.observedAt === 'string' ? event.observedAt.slice(11, 23) : '';
  if (typeof event?.semanticRole === 'string') return safe(semanticLine(when, event));
  const subject = event?.phase ?? event?.scenarioId ?? event?.stepId ?? '';
  const sequence = Number.isInteger(event?.sequence) ? `#${event.sequence}` : '';
  const line = [when, event?.observationType, subject, sequence, event?.status].filter(Boolean).join(' ');
  return safe(line.length ? `  . ${line}` : `  . ${pretty(event)}`);
}

function capabilityLine(item) {
  if (typeof item === 'string') return item;
  const identity = [item.capabilityId, item.namespaceId ?? item.capabilityVersion, item.target].filter(Boolean).join('  ');
  const scenarios = Number.isInteger(item.scenarioCount) ? `  (${item.scenarioCount} scenario${item.scenarioCount === 1 ? '' : 's'})` : '';
  const circuit = item.circuitAvailable === true ? '  [circuit retained]' : '';
  const matched = Array.isArray(item.matchedFields) && item.matchedFields.length ? `  [matched: ${item.matchedFields.join(', ')}]` : '';
  // The declared intent, when the estate retains one. A capability without one
  // is listed by identity alone rather than with a manufactured summary.
  const intent = typeof item.userStory?.intent === 'string' && item.userStory.intent.length
    ? `\n      ${item.userStory.intent}` : '';
  return `${identity}${scenarios}${circuit}${matched}${intent}`;
}

// A path selection over the delivered outcome. The capability's interface declares
// what its CLI surface shows; the CLI applies it read-side, so the canonical result
// (evidence, executions, observations) is unchanged.
const select = (value, path) => String(path).split('.')
  .reduce((current, key) => (current === null || current === undefined ? current : current[key]), value);

const mark = disposition => disposition === 'completed' ? '✓' : '×';
const responsibilityLine = entry => `  ${mark(entry.disposition)} ${entry.responsibilityId ?? entry.childScenarioId}` +
  (entry.durationMilliseconds === undefined || entry.durationMilliseconds === null ? '' : `  ${duration(entry.durationMilliseconds)}`);

// The observed story: declared scenario faces, responsibilities in declared order
// with testimony timing, and any composed child scenarios. The estate supplied the
// structure; the terminal supplies the layout and the declared display projection.
function storyLines(story, payload, request) {
  const lines = [`Scenario ${story.scenario?.scenarioId ?? ''}`];
  if (story.scenario?.inputId) lines.push(`GIVEN ${story.scenario.inputId}` +
    (story.scenario.inputContractId ? `  (${story.scenario.inputContractId})` : ''));
  lines.push('WHEN');
  for (const entry of story.scenario?.responsibilities ?? []) lines.push(responsibilityLine(entry));
  lines.push('THEN');
  lines.push(`  ${mark('completed')} ${story.scenario?.outcomeId ?? story.scenario?.scenarioId ?? ''}` +
    (story.scenario?.outcomeContractId ? `  (${story.scenario.outcomeContractId})` : ''));
  for (const composed of story.composedScenarios ?? []) {
    lines.push('', `Scenario ${composed.scenarioId}${composed.parentScenarioId ? `  under ${composed.parentScenarioId}` : ''}`);
    for (const entry of composed.responsibilities ?? []) lines.push(responsibilityLine(entry));
  }
  if (request?.display && payload?.display) {
    const value = select(payload?.result, payload.display.select);
    lines.push('', payload.display.as === 'json' ? pretty(value) : safe(String(value ?? '')));
  }
  return lines.join('\n');
}

const ABSENT = '(not declared)';
const fieldValue = text => (typeof text === 'string' && text.trim().length ? text : ABSENT);
const parseJson = text => { try { return typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; } };

// The canonical story of one capability: the declared feature, user story,
// experience, scenarios, execution plan, ports and contracts. Every value is
// retained authority read by the declared `read-capability-meaning` capability;
// the terminal contributes labels and ordering only.
function meaningLines(payload, request) {
  const meaning = payload?.meaning ?? {};
  const graph = meaning.graphSource ?? {};
  const documents = new Map((meaning.documents ?? []).map(entry => [entry.entry_id, entry.document]));
  const authority = parseJson(documents.get('capability.authority.json')) ?? {};
  const feature = documents.get('capability.feature');
  const markdown = request?.format === 'markdown';
  const lines = [];
  const heading = title => markdown ? ['', `## ${title}`] : ['', title, '-'.repeat(title.length)];
  const field = (label, text, width = 10) => `${label.padEnd(width)}  ${fieldValue(text)}`;
  lines.push(`Capability  ${fieldValue(payload?.capabilityId)}`);
  lines.push(`Namespace   ${fieldValue(meaning.namespaceId)}`);
  lines.push(`Root        ${fieldValue(meaning.rootScenarioId)}`);
  // The declared root and the scenario actually read are distinct facts.
  if (typeof meaning.selectedScenarioId === 'string' && meaning.selectedScenarioId !== meaning.rootScenarioId)
    lines.push(`Selected    ${fieldValue(meaning.selectedScenarioId)}`);
  lines.push(`View        ${fieldValue(payload?.view)}`);
  lines.push(`Snapshot    ${fieldValue(payload?.evidence?.snapshotId)}`);
  if (feature) {
    lines.push(...heading('Canonical feature'));
    for (const line of String(feature).split('\n').map(item => item.trimEnd()).filter(line => line.trim().length))
      lines.push(`  ${line}`);
  }
  const userStory = authority.userStory;
  lines.push(...heading('User story'));
  if (userStory) {
    lines.push(field('Actor', userStory.actor, 8));
    lines.push(field('Intent', userStory.intent, 8));
    lines.push(field('Outcome', userStory.outcome, 8));
  } else lines.push(`The estate declares no user story for this capability. ${ABSENT}`);
  const experience = authority.experience;
  lines.push(...heading('Experience'));
  if (experience) {
    lines.push(field('Actor', experience.actor));
    lines.push(field('Experience', experience.experienceId));
    lines.push(field('Promise', experience.promise));
    lines.push(field('Conditions', (experience.observableConditions ?? []).map(condition => condition.conditionId).join(', ')));
  } else lines.push(`The estate declares no experience for this capability. ${ABSENT}`);
  const scenarios = graph.scenarios ?? [];
  lines.push(...heading(`Scenarios (${scenarios.length})`));
  for (const scenario of scenarios) {
    lines.push(`  ${scenario.scenarioId}`);
    lines.push(`    input    ${fieldValue(scenario.input?.inputId)}  (${fieldValue(scenario.input?.contract?.contractId)})`);
    lines.push(`    event    ${fieldValue(scenario.event?.eventId)}  (${fieldValue(scenario.event?.executionAuthorityId)})`);
    lines.push(`    outcome  ${fieldValue(scenario.outcome?.outcomeId)}  (${fieldValue(scenario.outcome?.contract?.contractId)})${scenario.outcome?.terminal ? '  [terminal]' : ''}`);
  }
  const selected = meaning.selectedScenario;
  if (selected && meaning.selectedScenarioId !== meaning.rootScenarioId) {
    lines.push(...heading(`Selected scenario (${meaning.selectedScenarioId})`));
    lines.push(`  owning capability  ${fieldValue(selected.capabilityId)}`);
    lines.push(`  input    ${fieldValue(selected.input?.inputId)}  (${fieldValue(selected.input?.contract?.contractId)})`);
    lines.push(`  event    ${fieldValue(selected.event?.eventId)}  (${fieldValue(selected.event?.executionAuthorityId)})`);
    lines.push(`  outcome  ${fieldValue(selected.outcome?.outcomeId)}  (${fieldValue(selected.outcome?.contract?.contractId)})${selected.outcome?.terminal ? '  [terminal]' : ''}`);
  }
  const authorities = graph.executionAuthorities ?? [];
  lines.push(...heading(`Execution plan (${authorities.length})`));
  for (const entry of authorities) {
    lines.push(`  ${entry.id}  owning ${fieldValue(entry.owningScenarioId)}`);
    for (const operation of entry.operations ?? [])
      lines.push(`    ${fieldValue(operation.kind)} -> ${fieldValue(operation.portId ?? operation.scenarioId)}`);
  }
  const ports = graph.interfaceAuthority?.portBindings ?? [];
  lines.push(...heading(`Ports (${ports.length})`));
  for (const port of ports) lines.push(`  ${port.portId}  ->  ${fieldValue(port.platformCapabilityId)}`);
  const contracts = Object.keys(graph.contractAuthorities?.contracts ?? {});
  lines.push(...heading(`Contracts (${contracts.length})`));
  for (const contractId of contracts) lines.push(`  ${contractId}`);
  return lines.join('\n');
}

// The hierarchical trace: the observed cells nested by their planned parent, in
// execution order. It is the same overlay the story joins; the trace reading
// keeps the mechanical depth the story collapses.
function traceLines(overlay) {
  const children = new Map();
  for (const cell of overlay?.cells ?? []) {
    const parent = cell.parentCellId ?? null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(cell);
  }
  const order = cell => cell.observed?.[0]?.logicalOrder ?? Number.MAX_SAFE_INTEGER;
  for (const list of children.values()) list.sort((left, right) => order(left) - order(right));
  const label = cell => {
    const address = cell.semanticAddress ?? {};
    if (address.semanticRole === 'SCENARIO_OUTCOME') return `scenario ${address.scenarioId}`;
    if (address.semanticRole === 'EXECUTION_RESPONSIBILITY') return address.responsibilityId ?? cell.cellId;
    return [address.mechanicId, address.mechanicPath].filter(Boolean).join(' ') || cell.cellId;
  };
  const lines = ['TRACE'];
  const walk = (parent, depth) => {
    for (const cell of children.get(parent) ?? []) {
      const observed = cell.observed?.[0];
      const mark = observed === undefined ? '—' : observed.disposition === 'completed' ? '✓' : '×';
      const timing = duration(observed?.durationMilliseconds);
      lines.push(`${'  '.repeat(depth)}${mark} ${label(cell)}${timing ? `  ${timing}` : ''}`);
      walk(cell.cellId, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

function format(operation, payload, request) {
  if (operation === 'reveal' && payload?.meaning) return meaningLines(payload, request);
  if (operation === 'observe' && payload?.story) {
    const story = storyLines(payload.story, payload, request);
    return request?.trace && payload.overlay ? `${story}\n\n${traceLines(payload.overlay)}` : story;
  }
  if (request?.display && payload?.display) {
    const value = select(payload?.result, payload.display.select);
    return payload.display.as === 'json' ? pretty(value) : safe(String(value ?? ''));
  }
  // A projection report names where the mechanical bodies landed and what each
  // target's plan covers. The digests are the estate's; nothing is recomputed.
  if (operation === 'project' && Array.isArray(payload?.plans)) {
    const lines = [`Projected ${fieldValue(payload.capabilityId)} -> ${fieldValue(payload.outDir)}`];
    for (const plan of payload.plans) {
      const closure = plan.mechanicsComplete === true ? '' : '  [mechanics incomplete]';
      lines.push(`  ${String(plan.target).padEnd(7)}  canonical ${fieldValue(plan.canonicalGraphDigest)}`
        + `  bindings ${plan.providerBindings}/${plan.requiredSlots}${closure}`);
    }
    lines.push(`${fieldValue(payload.conformance)}; ${payload.documents ?? 0} declared document(s), `
      + `${payload.files ?? 0} file(s)${payload.fullMechanics === true ? '; full mechanics required' : ''}`);
    return lines.join('\n');
  }
  // A narrative is human language the estate composed from its own retained
  // authority. It is printed exactly as delivered.
  if (Array.isArray(payload?.narrative) && payload.narrative.every(line => typeof line === 'string')) {
    return payload.narrative.join('\n');
  }
  const items = rows(payload);
  if (['list', 'find', 'catalogue'].includes(operation) && items) {
    return section(`Capabilities (${items.length})`, list(items, capabilityLine));
  }
  return pretty(payload);
}

export function render(request, result, mapping) {
  const spec = semanticCommand(request.object, request.verb, mapping);
  const payload = result?.payload ?? result;
  if (!spec?.offered) return safe(pretty(payload));
  return safe(format(spec.wraps.operation, payload, request));
}
