import path from 'node:path';
import { readdir, unlink } from 'node:fs/promises';
import { digest, readJson, writeJson } from './data.mjs';
import { requireValue, SidefxError } from './errors.mjs';

const providerPattern = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
export const isProviderId = value => providerPattern.test(value);
export const isCapabilityId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export class ProviderCatalog {
  constructor({ catalogPaths = [], stateRoot }) {
    this.paths = catalogPaths.map(file => path.resolve(file));
    this.root = path.join(path.resolve(stateRoot), 'providers');
  }

  async records() {
    const byId = new Map();
    for (const file of this.paths) {
      const catalog = await readJson(file);
      requireValue(catalog.catalogType === 'sfx-provider-catalog.v1' && Array.isArray(catalog.providers),
        'CATALOG_REJECTED', `Invalid provider catalog: ${file}`, 2);
      for (const provider of catalog.providers) {
        requireValue(provider && isProviderId(provider.providerId) && typeof provider.name === 'string'
          && provider.source && typeof provider.source.reference === 'string'
          && ['OBSERVED', 'DECLARED', 'ILLUSTRATIVE'].includes(provider.source.kind)
          && Array.isArray(provider.candidateCapabilities) && provider.candidateCapabilities.every(isCapabilityId)
          && Array.isArray(provider.operations),
        'CATALOG_REJECTED', `Provider descriptors require identity, provenance, operations, and candidateCapabilities: ${file}`, 2);
        requireValue(!byId.has(provider.providerId), 'CATALOG_IDENTITY_CONFLICT', `Duplicate provider ${provider.providerId}.`, 2);
        byId.set(provider.providerId, {
          providerId: provider.providerId, name: provider.name,
          description: provider.description ?? '', source: provider.source,
          operations: provider.operations, candidateCapabilities: provider.candidateCapabilities,
          transport: provider.transport ?? null,
          // A catalog is discovery testimony, even when it includes conformance claims.
          evidenceScope: 'DISCOVERY_TESTIMONY', conformanceClaims: provider.conformanceClaims ?? null,
          descriptorDigest: digest(provider),
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  async search(namespace, query = '') {
    const records = await this.records();
    requireValue(records.some(provider => provider.providerId.startsWith(`${namespace}/`)),
      'DISCOVERY_SOURCE_REQUIRED', `No ${namespace} catalog is configured. Supply --catalog FILE with declared provider observations.`);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return records.filter(provider => provider.providerId.startsWith(`${namespace}/`)
      && words.every(word => JSON.stringify(provider).toLowerCase().includes(word)));
  }

  async inspect(id) {
    requireValue(isProviderId(id), 'PROVIDER_ID_REJECTED', 'Provider identities use namespace/name.', 2);
    const record = (await this.records()).find(provider => provider.providerId === id);
    if (record) return record;
    try {
      const saved = await readJson(this.file(id));
      requireValue(saved.providerId === id && saved.registrationType === 'sfx-provider-reference.v1',
        'PROVIDER_REFERENCE_REJECTED', 'Invalid local provider reference.');
      return { ...saved, evidenceScope: 'LOCAL_REFERENCE_ONLY', operations: [], candidateCapabilities: [] };
    } catch (error) {
      if (error.code !== 'JSON_READ_FAILED') throw error;
      throw new SidefxError('PROVIDER_NOT_FOUND', `No descriptor or registered reference for ${id}. Use --catalog FILE or sfx provider add ${id}.`);
    }
  }

  file(id) {
    requireValue(isProviderId(id), 'PROVIDER_ID_REJECTED', 'Provider identities use namespace/name.', 2);
    return path.join(this.root, `${encodeURIComponent(id)}.json`);
  }

  async add(id) {
    const file = this.file(id);
    const record = { registrationType: 'sfx-provider-reference.v1', providerId: id,
      disposition: 'REFERENCE_REGISTERED', registeredAt: new Date().toISOString() };
    try { await writeJson(file, record, { exclusive: true }); return record; } catch (error) {
      if (error.code === 'EEXIST') return readJson(file);
      throw error;
    }
  }

  async remove(id) {
    try { await unlink(this.file(id)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { providerId: id, disposition: 'REFERENCE_REMOVED' };
  }

  async registered() {
    let files;
    try { files = await readdir(this.root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return Promise.all(files.filter(file => file.endsWith('.json')).sort().map(file => readJson(path.join(this.root, file))));
  }
}
