import { digest, readJson } from './data.mjs';
import { requireValue } from './errors.mjs';
import { isCapabilityId } from './catalog.mjs';

export const delegatedVerbs = ['evaluate', 'assimilate', 'author', 'resolve', 'install', 'publish', 'govern', 'compare'];

export async function resolveRoute(routesPath, verb, subject) {
  requireValue(routesPath, 'CAPABILITY_ROUTE_REQUIRED',
    `${verb} requires an explicit capability binding. Use --via CAPABILITY --input @request.json, or --routes FILE.`);
  const document = await readJson(routesPath);
  requireValue(document.routesType === 'sfx-surface-routes.v1' && Array.isArray(document.routes),
    'ROUTES_REJECTED', 'Expected sfx-surface-routes.v1 with a routes array.', 2);
  const keys = new Set();
  for (const route of document.routes) {
    const key = `${route.verb}:${route.subject}`;
    requireValue(delegatedVerbs.includes(route.verb) && typeof route.subject === 'string'
      && route.subject.length > 0 && isCapabilityId(route.capabilityId)
      && /^sha256:[a-f0-9]{64}$/.test(route.capsuleDigest) && !keys.has(key),
    'ROUTES_REJECTED', 'Routes require unique verb/subject pairs, capabilityId and exact capsuleDigest.', 2);
    keys.add(key);
  }
  const route = document.routes.find(item => item.verb === verb && item.subject === subject)
    ?? document.routes.find(item => item.verb === verb && item.subject === '*');
  requireValue(route, 'CAPABILITY_ROUTE_REQUIRED', `No ${verb} route for ${subject}.`);
  return { ...route, routeDigest: digest(route) };
}
