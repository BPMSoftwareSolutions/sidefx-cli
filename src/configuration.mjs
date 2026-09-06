import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { requireValue, SidefxError } from './errors.mjs';
import { loadCommandSurface } from './commands.mjs';

export async function loadConfiguration(configPath, cwd = process.cwd(), { estateRoot } = {}) {
  // An explicit estate selects its own configuration, including when it has none.
  // Never let the caller's working directory silently substitute another provider.
  const file = configPath ? path.resolve(cwd, configPath)
    : path.resolve(cwd, estateRoot || '.', 'sfx.config.json');
  let document;
  try { document = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) {
    if (!configPath && error.code === 'ENOENT') return {};
    throw new SidefxError('CONFIGURATION_REJECTED', `Cannot load configuration: ${file}`, 2);
  }
  requireValue(document?.configurationType === 'sfx-project.v1'
    && Object.keys(document).every(key => ['configurationType', 'estate', 'catalogs', 'routes', 'runtimes', 'commands'].includes(key))
    && (document.estate === undefined || (typeof document.estate === 'string' && document.estate.length > 0))
    && (document.catalogs === undefined || (Array.isArray(document.catalogs) && document.catalogs.every(item => typeof item === 'string')))
    && (document.runtimes === undefined || (Array.isArray(document.runtimes) && document.runtimes.every(item => typeof item === 'string')))
    && (document.routes === undefined || typeof document.routes === 'string')
    && (document.commands === undefined || typeof document.commands === 'string'),
  'CONFIGURATION_REJECTED', 'Expected sfx-project.v1 with catalog, route and runtime file references.', 2);
  const resolve = value => path.resolve(path.dirname(file), value);
  return { ...(document.estate === undefined ? {} : { estateRoot: resolve(document.estate) }),
    catalogPaths: (document.catalogs ?? []).map(resolve),
    runtimePaths: (document.runtimes ?? []).map(resolve),
    commandSurface: document.commands === undefined ? undefined : await loadCommandSurface(resolve(document.commands)),
    defaultRoutesPath: document.routes === undefined ? undefined : resolve(document.routes) };
}
