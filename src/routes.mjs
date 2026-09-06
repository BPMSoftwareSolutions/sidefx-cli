import { digest, readJson } from './data.mjs';
import { requireValue } from './errors.mjs';
import { isCapabilityId } from './catalog.mjs';
import { semanticCommand } from './commands.mjs';

export const delegatedVerbs = ['evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'];
const routeFields = new Set(['object', 'verb', 'subject', 'capabilityId', 'capsuleDigest']);
const authorityRouteFields = new Set(['object', 'verb', 'subject', 'capabilityId', 'authorityDigest']);

export async function resolveRoute(routesPath, verb, subject, object) {
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
    requireValue((typed ? semanticCommand(route.object, route.verb)?.bindable
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
