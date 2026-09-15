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
  const label = event.semanticRole === 'SCENARIO_OUTCOME' ? `scenario ${event.scenarioId}`
    : event.semanticRole === 'MECHANIC' ? `mechanic ${event.mechanicId ?? event.cellId}`
      : event.responsibilityKind === 'invoke-scenario' ? `scenario ${event.childScenarioId ?? event.responsibilityId}`
        : event.responsibilityId ?? event.cellId ?? event.edgeId;
  // An edge is the admission path into the addressed cell, not the cell itself.
  const mark = typeof event.edgeId === 'string' ? '↳' : event.semanticRole === 'MECHANIC' ? '·' : '✓';
  return [' ', mark, when, label, duration(event.durationMilliseconds)].filter(Boolean).join(' ');
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

function format(operation, payload, request) {
  if (operation === 'observe' && payload?.story) return storyLines(payload.story, payload, request);
  if (request?.display && payload?.display) {
    const value = select(payload?.result, payload.display.select);
    return payload.display.as === 'json' ? pretty(value) : safe(String(value ?? ''));
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
