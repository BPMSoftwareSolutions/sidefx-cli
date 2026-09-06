import path from 'node:path';
import { createRequire } from 'node:module';
import { requireValue, SidefxError } from './errors.mjs';

const installed = createRequire(import.meta.url);

// Package exports locate installed mechanics; the connection still pins their bytes.
export function resolveRuntimeArtifact(reference, manifestPath) {
  if (!reference.startsWith('module:')) return path.resolve(path.dirname(manifestPath), reference);
  const specifier = reference.slice('module:'.length);
  requireValue(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/.test(specifier)
    && !specifier.split('/').some(segment => segment === '.' || segment === '..'),
  'RUNTIME_PROFILE_REJECTED', 'Module artifacts require a package export identity.', 2);
  for (const resolver of [createRequire(path.resolve(manifestPath)), installed]) {
    try { return resolver.resolve(specifier); }
    catch (error) {
      if (!['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code)) throw error;
    }
  }
  throw new SidefxError('RUNTIME_PACKAGE_REQUIRED', `Install the runtime package exporting ${specifier}.`, 3);
}
