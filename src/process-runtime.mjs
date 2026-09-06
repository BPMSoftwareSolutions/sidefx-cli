import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bytesDigest } from './data.mjs';
import { requireValue, SidefxError } from './errors.mjs';
import { isCapabilityId } from './catalog.mjs';
import { resolveRuntimeArtifact } from './runtime-artifacts.mjs';

const sha = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

// Generic process transport. Contracts and effects belong to the selected provider.
export class ConfiguredRuntime {
  constructor({ runtimePaths, estateRuntime, timeoutMs = 120_000 }) {
    this.paths = runtimePaths;
    this.estate = estateRuntime;
    this.timeoutMs = timeoutMs;
    requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647,
      'INVALID_TIMEOUT', 'Runtime timeout must be a positive bounded integer.', 2);
  }

  async bindings() {
    const bindings = new Map();
    for (const file of this.paths) {
      const bytes = await readFile(file);
      const manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      requireValue(manifest?.runtimeType === 'sfx-process-runtime.v1'
        && typeof manifest.executable === 'string' && manifest.executable.length > 0
        && Array.isArray(manifest.args) && manifest.args.every(arg => typeof arg === 'string'
          || (arg && typeof arg.artifact === 'string' && Object.keys(arg).length === 1))
        && typeof manifest.providerId === 'string' && typeof manifest.profileId === 'string'
        && typeof manifest.runtimeFamily === 'string'
        && manifest.artifacts && Object.keys(manifest.artifacts).length > 0
        && manifest.capabilities && Object.keys(manifest.capabilities).length > 0,
      'RUNTIME_PROFILE_REJECTED', 'Invalid process runtime profile.', 2);
      const root = path.dirname(path.resolve(file));
      const artifacts = new Map();
      const artifactPaths = new Map();
      for (const [reference, expected] of Object.entries(manifest.artifacts)) {
        requireValue(sha(expected), 'RUNTIME_PROFILE_REJECTED', 'Every runtime artifact needs an exact digest.', 2);
        const artifactPath = resolveRuntimeArtifact(reference, path.resolve(file));
        const artifact = await readFile(artifactPath);
        requireValue(bytesDigest(artifact) === expected, 'RUNTIME_ARTIFACT_CHANGED',
          `Runtime artifact changed: ${reference}. Review and rebind the provider.`, 4);
        artifacts.set(reference, artifact);
        artifactPaths.set(reference, artifactPath);
      }
      const args = manifest.args.map(arg => {
        if (typeof arg === 'string') return arg;
        requireValue(artifactPaths.has(arg.artifact), 'RUNTIME_BINDING_REJECTED',
          'An artifact argument must reference a digest-bound artifact.', 2);
        return artifactPaths.get(arg.artifact);
      });
      for (const [capabilityId, reference] of Object.entries(manifest.capabilities)) {
        requireValue(isCapabilityId(capabilityId) && artifacts.has(reference) && !bindings.has(capabilityId),
          'RUNTIME_BINDING_REJECTED', 'Runtime capability bindings must be unique and digest-bound.', 2);
        const authority = JSON.parse(artifacts.get(reference).toString('utf8'));
        requireValue(authority.representationType === 'sfx-capability-representation.v1'
          && authority.capabilityId === capabilityId && typeof authority.capabilityVersion === 'string'
          && Array.isArray(authority.scenarios) && authority.scenarios.length > 0 && authority.contracts,
        'CAPABILITY_REPRESENTATION_REJECTED', 'Invalid capability representation from the configured provider.', 4);
        const authorityPath = artifactPaths.get(reference);
        const relative = this.estate.estateRoot && path.relative(this.estate.estateRoot, authorityPath);
        const estateOwned = Boolean(this.estate.estateRoot) && relative !== undefined && relative !== null
          && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
        const capability = { ...authority, capsuleDigest: null,
          capabilityAuthorityDigest: manifest.artifacts[reference],
          authority: { entryRef: reference, entryDigest: manifest.artifacts[reference], value: authority },
          authorityScope: estateOwned ? 'ESTATE_CONFIGURED_CAPABILITY' : 'LOCAL_INSTALLED_CAPABILITY',
          authorityPath, runtimeManifestPath: path.resolve(file), managedAdmission: 'NOT_CLAIMED',
          runtimeManifestDigest: bytesDigest(bytes), target: manifest.runtimeFamily,
          providers: [{ bindingId: capabilityId, providerCapabilityId: manifest.providerId,
            providerProfileId: manifest.profileId, runtimeFamily: manifest.runtimeFamily }],
          plan: { type: manifest.runtimeType, entryRef: file, entryDigest: bytesDigest(bytes) } };
        bindings.set(capabilityId, { root, manifest: { ...manifest, args }, capability });
      }
    }
    return bindings;
  }

  async request(operation, fields = {}) {
    const bindings = await this.bindings();
    if (operation === 'list') {
      const local = [...bindings.values()].map(({ capability }) => capability)
        .filter(capability => !fields.query || JSON.stringify(capability).toLowerCase().includes(fields.query.toLowerCase()));
      const estate = this.estate.estateRoot ? await this.estate.request(operation, fields) : { result: [] };
      requireValue(!estate.result.some(item => bindings.has(item.capabilityId)), 'CAPABILITY_IDENTITY_CONFLICT',
        'Configured runtime and estate contain the same capability identity. Select an unambiguous configuration.', 4);
      return { ...estate, runtimeManifestDigests: [...new Set(local.map(item => item.runtimeManifestDigest))],
        result: [...estate.result, ...local] };
    }
    const binding = bindings.get(fields.capabilityId);
    if (!binding) return this.estate.request(operation, fields);
    const { capability } = binding;
    const identity = { estateManifestDigest: null, runtimeManifestDigest: capability.runtimeManifestDigest };
    if (operation === 'inspect') return { ...identity, result: { representationType: capability.representationType, capability } };
    if (operation === 'resolve') return { ...identity, result: { inspection: capability,
      dependencyResolution: { disposition: 'BOUND', authorityScope: capability.authorityScope,
        runtimeManifestDigest: capability.runtimeManifestDigest, providers: capability.providers } } };
    requireValue(operation === 'invoke', 'RUNTIME_OPERATION_UNAVAILABLE',
      'This runtime supports inspection, resolution and invocation. It does not supply estate fixture proof.');
    requireValue(fields.capabilityAuthorityDigest === capability.capabilityAuthorityDigest
      && fields.runtimeManifestDigest === capability.runtimeManifestDigest,
    'RUNTIME_BINDING_CHANGED', 'The selected authority or runtime changed before invocation.', 4);
    const response = await this.invoke(binding, fields);
    requireValue(response?.protocol === 'sfx-runtime-response.v1' && response.capabilityId === fields.capabilityId,
      'RUNTIME_PROTOCOL_REJECTED', 'The configured provider returned an invalid response envelope.', 4);
    if (response.error) throw new SidefxError(response.error.code ?? 'PROVIDER_FAILED',
      response.error.message ?? 'The configured provider rejected the request.', 4);
    requireValue(Object.hasOwn(response, 'result'), 'RUNTIME_PROTOCOL_REJECTED', 'The provider returned no result.', 4);
    return { ...identity, result: response.result };
  }

  invoke({ root, manifest }, fields) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'CAPSULE_INVOKE_OVERLAY_ROOT', 'CAPSULE_INVOKE_REPLACEMENT_IDS', 'SIDEFX_PLATFORM_ROOT']) delete env[name];
      const child = spawn(manifest.executable, manifest.args, { cwd: root, env,
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      let size = 0;
      let failure;
      const stop = (code, message) => { failure ??= new SidefxError(code, message, 4); child.kill(); };
      const timer = setTimeout(() => stop('RUNTIME_TIMEOUT', 'Provider delivery timed out; inspect evidence before retrying an effect.'), this.timeoutMs);
      const interrupt = () => stop('RUNTIME_INTERRUPTED', 'Provider delivery was interrupted; effects may have occurred.');
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      child.stdout.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) stop('RUNTIME_OUTPUT_LIMIT', 'Provider output exceeded 8 MiB.');
        else chunks.push(chunk);
      });
      // Diagnostics are drained, never mixed into canonical output or error receipts.
      child.stderr.on('data', () => {});
      child.on('error', () => { failure ??= new SidefxError('RUNTIME_START_FAILED', 'Could not start the configured runtime executable.', 4); });
      child.stdin.on('error', () => {});
      child.on('close', code => {
        clearTimeout(timer);
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
        if (failure) return reject(failure);
        if (code !== 0) return reject(new SidefxError('RUNTIME_FAILED', `Configured provider exited ${code}.`, 4));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new SidefxError('RUNTIME_PROTOCOL_REJECTED', 'Provider stdout must contain exactly one JSON response.', 4)); }
      });
      child.stdin.end(JSON.stringify({ protocol: 'sfx-runtime-request.v1', capabilityId: fields.capabilityId,
        capabilityAuthorityDigest: fields.capabilityAuthorityDigest, input: fields.input }));
    });
  }
}
