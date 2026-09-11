import { requireValue, SidefxError } from './errors.mjs';
import { assertJson } from './data.mjs';
import { validateSemanticRequest } from './commands.mjs';
import { deliver, deliverCommand, repositoryRootRef } from './delivery.mjs';
import { tmpdir } from 'node:os';

export { SidefxError } from './errors.mjs';
export { loadCommandMapping } from './commands.mjs';
export { loadConfiguration } from './configuration.mjs';

export function createSidefx(options = {}) {
  return new Sidefx(options);
}

// Resolve a declared field template against the caller's request. The mapping names the
// estate's field; sfx only supplies the operand it already parsed.
function resolveTemplate(template, request) {
  if (Array.isArray(template)) return template.map(item => resolveTemplate(item, request));
  if (typeof template !== 'string' || !template.startsWith('$')) return template;
  switch (template) {
    case '$subject': return request.subject;
    case '$other': return request.other;
    case '$query': return request.query;
    case '$input': return request.input;
    case '$scenario': return request.scenario;
    default: throw new SidefxError('COMMAND_MAPPING_REJECTED', `Unknown field template ${template}.`, 2);
  }
}

class Sidefx {
  constructor({ mapping, estateRoot, deliveries = {}, timeoutMs } = {}) {
    this.mapping = mapping;
    this.estateRoot = estateRoot ?? process.env.SIDEFX_ESTATE;
    this.timeoutMs = timeoutMs;
    this.deliveries = deliveries;
  }

  async execute(request, { onObservation } = {}) {
    request = { ...request };
    if (request.input !== undefined) {
      assertJson(request.input);
      request.input = JSON.parse(JSON.stringify(request.input));
    }
    const spec = validateSemanticRequest(request, this.mapping);

    // A command the estate does not yet offer fails as exactly that. sfx never
    // substitutes a local implementation for a missing estate operation.
    if (!spec.offered) {
      throw new SidefxError('COMMAND_NOT_OFFERED',
        `sfx ${request.object} ${request.verb} is not yet offered by the selected estate. Needed: ${spec.missing.need}`,
        3, { object: request.object, verb: request.verb, ...spec.missing });
    }

    const surface = this.mapping.surfaces[spec.wraps.surface];
    const payload = { command: spec.wraps.operation };
    if (surface.rootRefField) payload[surface.rootRefField] = repositoryRootRef(this.estateRoot ?? '.');
    if (surface.disposableParentRootRefField) {
      payload[surface.disposableParentRootRefField] = repositoryRootRef(tmpdir());
    }
    for (const [field, template] of Object.entries(spec.wraps.fields ?? {})) {
      const value = resolveTemplate(template, request);
      if (value !== undefined) payload[field] = value;
    }
    payload.requestLineage = [`sfx:${request.object} ${request.verb}`];

    const result = surface.delivery ? await deliverCommand({
      binding: Object.hasOwn(this.deliveries, surface.delivery) ? this.deliveries[surface.delivery] : undefined,
      operation: spec.wraps.operation, request, timeoutMs: this.timeoutMs,
      onObservation,
    }) : await deliver({
      estateRoot: this.estateRoot,
      capabilityId: surface.capabilityId,
      request: { contractId: surface.request, payload },
      timeoutMs: this.timeoutMs,
    });

    requireValue(result && typeof result === 'object', 'DELIVERY_PROTOCOL_REJECTED',
      'The estate returned no canonical result.', 4);
    // A terminal scenario outcome is a completed delivery. Only a runtime failure is an
    // sfx failure; a domain rejection is carried through and exits 0, for the caller to read.
    if (!['terminated', 'completed'].includes(result.disposition)) {
      throw new SidefxError(result.errorCode ?? 'ESTATE_OPERATION_FAILED',
        result.errorCode ?? `The estate returned disposition ${result.disposition}.`, 4,
        { capabilityId: surface.capabilityId, operation: spec.wraps.operation, result });
    }
    return result.outcome ?? result;
  }
}
