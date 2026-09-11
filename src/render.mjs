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

// Telemetry is shown as the estate reported it. No field is derived, renamed or
// inferred here, and an event carrying none of these fields prints as itself.
export function renderObservation(event, json = false) {
  if (json) return JSON.stringify({ observation: event });
  const when = typeof event?.observedAt === 'string' ? event.observedAt.slice(11, 23) : '';
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

function format(operation, payload) {
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
  return safe(format(spec.wraps.operation, payload));
}
