import { digest, readJson } from './data.mjs';
import { requireValue } from './errors.mjs';
import { isCapabilityId } from './catalog.mjs';
import { semanticCommand } from './commands.mjs';

export const delegatedVerbs = ['evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'];
const routeFields = new Set(['object', 'verb', 'subject', 'capabilityId', 'capsuleDigest']);
const authorityRouteFields = new Set(['object', 'verb', 'subject', 'capabilityId', 'authorityDigest']);

// Operation relationships are public entity metadata. No target identity or domain
// is inferred from names, transports, candidate lists, or contract vocabulary.
export function resolveEntityOperation(entity, { object, verb, subject }, vocabulary) {
  const bindings = entity.commandBindings ?? [];
  requireValue(Array.isArray(bindings), 'ENTITY_BINDING_REJECTED', 'Expected an array of declared command bindings.', 2);
  const seen = new Set();
  for (const binding of bindings) {
    requireValue(binding && typeof binding === 'object' && !Array.isArray(binding)
      && Object.keys(binding).every(key => ['object', 'verb', 'capabilityId', 'capsuleDigest', 'authorityDigest'].includes(key))
      && semanticCommand(binding.object, binding.verb, vocabulary)?.bindable && isCapabilityId(binding.capabilityId)
      && ['capsuleDigest', 'authorityDigest'].filter(key => Object.hasOwn(binding, key)).length === 1
      && /^sha256:[a-f0-9]{64}$/.test(binding.capsuleDigest ?? binding.authorityDigest),
    'ENTITY_BINDING_REJECTED', 'An entity operation requires its declared type, operation, capability and one exact authority pin.', 2);
    const key = JSON.stringify([binding.object, binding.verb]);
    requireValue(!seen.has(key), 'ENTITY_BINDING_AMBIGUOUS', 'An entity declares multiple bindings for the same operation.', 2);
    seen.add(key);
  }
  const binding = bindings.find(item => item.object === object && item.verb === verb);
  if (!binding) return null;
  return { ...binding, subject, source: 'ENTITY_OPERATION_AUTHORITY',
    entityDigest: entity.descriptorDigest ?? entity.capabilityAuthorityDigest ?? entity.receiptDigest,
    routeDigest: digest(binding) };
}

export async function resolveRoute(routesPath, verb, subject, object, vocabulary) {
  requireValue(routesPath, 'CAPABILITY_ROUTE_REQUIRED',
    `${verb} requires an explicit capability binding. Use --via CAPABILITY --input @request.json, or --routes FILE.`);
  const document = await readJson(routesPath);
  requireValue(document && typeof document === 'object' && !Array.isArray(document),
    'ROUTES_REJECTED', 'Expected a route document.', 2);
  const authorityRoutes = document.routesType === 'sfx-surface-routes.v3';
  const typed = authorityRoutes || document.routesType === 'sfx-surface-routes.v2';
  requireValue(!typed || Object.keys(document).every(field => ['routesType', 'routes'].includes(field)),
    'ROUTES_REJECTED', 'An object-scoped route document contains only routesType and routes.', 2);
  requireValue((typed || document.routesType === 'sfx-surface-routes.v1') && Array.isArray(document.routes),
    'ROUTES_REJECTED', 'Expected sfx-surface-routes.v1, v2 or v3 with a routes array.', 2);
  requireValue(typed === (object !== undefined), 'ROUTE_OBJECT_REQUIRED',
    'Object-first commands require v2 routes with explicit objects; verb-first aliases use v1 routes.', 2);
  const keys = new Set();
  for (const route of document.routes) {
    requireValue(route && typeof route === 'object' && !Array.isArray(route), 'ROUTES_REJECTED', 'Each route must be an object.', 2);
    requireValue(!typed || Object.keys(route).every(field => (authorityRoutes ? authorityRouteFields : routeFields).has(field)), 'ROUTES_REJECTED',
      'Routes contain only object, verb, subject, capabilityId and the versioned authority pin; domain configuration belongs in canonical input.', 2);
    const key = JSON.stringify([route.object ?? null, route.verb, route.subject]);
    requireValue((typed ? semanticCommand(route.object, route.verb, vocabulary)?.bindable
      : route.object === undefined && delegatedVerbs.includes(route.verb)) && typeof route.subject === 'string'
      && route.subject.length > 0 && isCapabilityId(route.capabilityId)
      && /^sha256:[a-f0-9]{64}$/.test(authorityRoutes ? route.authorityDigest : route.capsuleDigest) && !keys.has(key),
    'ROUTES_REJECTED', 'Routes require unique object/verb/subject bindings, capabilityId and an exact authority pin.', 2);
    keys.add(key);
  }
  const matches = item => item.object === object && item.verb === verb;
  const route = document.routes.find(item => matches(item) && item.subject === subject)
    ?? document.routes.find(item => matches(item) && item.subject === '*');
  requireValue(route, 'CAPABILITY_ROUTE_REQUIRED', `No ${verb} route for ${subject}.`);
  return { ...route, routeDigest: digest(route) };
}
