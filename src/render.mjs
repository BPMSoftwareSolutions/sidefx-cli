import { semanticCommand } from './commands.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const safe = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const section = (name, value) => `${name}\n${'-'.repeat(name.length)}\n${value}`;
const list = (values, format = value => value) => values.length ? values.map(format).join('\n') : '(none)';

// Rendering is presentation over a canonical estate result. It reshapes nothing and
// recalculates no disposition, so an unrecognised shape is shown verbatim.
function rows(payload) {
  for (const value of [payload, payload?.capabilities, payload?.result, payload?.items]) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function format(operation, payload) {
  const items = rows(payload);
  if (operation === 'list' && items) {
    return section(`Capabilities (${items.length})`, list(items, item => typeof item === 'string' ? item
      : [item.capabilityId, item.capabilityVersion, item.target].filter(Boolean).join('  ')));
  }
  return pretty(payload);
}

export function render(request, result, mapping) {
  const spec = semanticCommand(request.object, request.verb, mapping);
  const payload = result?.payload ?? result;
  if (!spec?.offered) return safe(pretty(payload));
  return safe(format(spec.wraps.operation, payload));
}
