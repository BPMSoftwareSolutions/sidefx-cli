import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { requireValue, SidefxError } from './errors.mjs';

export async function loadConfiguration(configPath, cwd = process.cwd()) {
  const file = path.resolve(cwd, configPath ?? 'sfx.config.json');
  let document;
  try { document = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) {
    if (!configPath && error.code === 'ENOENT') return {};
    throw new SidefxError('CONFIGURATION_REJECTED', `Cannot load configuration: ${file}`, 2);
  }
  requireValue(document?.configurationType === 'sfx-project.v1'
    && Object.keys(document).every(key => ['configurationType', 'catalogs', 'routes', 'runtimes'].includes(key))
    && (document.catalogs === undefined || (Array.isArray(document.catalogs) && document.catalogs.every(item => typeof item === 'string')))
    && (document.runtimes === undefined || (Array.isArray(document.runtimes) && document.runtimes.every(item => typeof item === 'string')))
    && (document.routes === undefined || typeof document.routes === 'string'),
  'CONFIGURATION_REJECTED', 'Expected sfx-project.v1 with catalog, route and runtime file references.', 2);
  const resolve = value => path.resolve(path.dirname(file), value);
  return { catalogPaths: (document.catalogs ?? []).map(resolve),
    runtimePaths: (document.runtimes ?? []).map(resolve),
    defaultRoutesPath: document.routes === undefined ? undefined : resolve(document.routes) };
}
