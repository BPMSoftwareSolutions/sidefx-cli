import os from 'node:os';
import path from 'node:path';
import { EstateRuntime } from './runtime.mjs';
import { ReceiptStore, explainReceipt, isExecutionId } from './receipts.mjs';
import { ProviderCatalog, isProviderId, isCapabilityId } from './catalog.mjs';
import { projectCapability, revealCapability, structuralDiff } from './projection.mjs';
import { delegatedVerbs, resolveRoute } from './routes.mjs';
import { requireValue, SidefxError } from './errors.mjs';
import { assertJson } from './data.mjs';
import { validateSemanticRequest, projectSemanticRequest } from './commands.mjs';
import { ConfiguredRuntime } from './process-runtime.mjs';

export { SidefxError } from './errors.mjs';
export { EstateRuntime } from './runtime.mjs';
export { ConfiguredRuntime } from './process-runtime.mjs';
export { loadConfiguration } from './configuration.mjs';

export function createSidefx(options = {}) {
  return new Sidefx(options);
}

class Sidefx {
  constructor(options) {
    this.runtime = options.runtime ?? new EstateRuntime({
      estateRoot: options.estateRoot ?? process.env.SIDEFX_ESTATE,
      timeoutMs: options.timeoutMs,
    });
    if (!options.runtime && options.runtimePaths?.length) this.runtime = new ConfiguredRuntime({
      runtimePaths: options.runtimePaths, estateRuntime: this.runtime, timeoutMs: options.timeoutMs,
    });
    const stateRoot = options.stateRoot ?? process.env.SIDEFX_HOME ?? path.join(os.homedir(), '.sidefx');
    this.receipts = new ReceiptStore(stateRoot);
    this.catalog = new ProviderCatalog({ catalogPaths: options.catalogPaths, stateRoot });
    this.routesPath = options.routesPath;
    this.defaultRoutesPath = options.defaultRoutesPath;
  }

  async inspectCapability(id) {
    requireValue(isCapabilityId(id), 'CAPABILITY_ID_REJECTED', 'Use an exact hyphenated capability identity.', 2);
    const response = await this.runtime.request('inspect', { capabilityId: id });
    const capability = response.result.representationType === 'sfx-capability-representation.v1'
      ? response.result.capability : projectCapability(response.result);
    requireValue(capability.capabilityId === id, 'CAPABILITY_IDENTITY_CONFLICT', 'Runtime returned a different capability identity.', 4);
    return { ...capability, estateManifestDigest: response.estateManifestDigest };
  }

  async inspect(id) {
    return isProviderId(id) ? this.catalog.inspect(id) : this.inspectCapability(id);
  }

  async readEntity(object, id) {
    switch (object) {
      case 'provider': return this.catalog.inspect(id);
      case 'capability': return this.inspectCapability(id);
      case 'capsule': {
        const capability = await this.inspectCapability(id);
        requireValue(capability.capsuleDigest, 'CAPSULE_UNAVAILABLE', 'The selected capability has no estate capsule.');
        return capability;
      }
      case 'execution': case 'evidence': return this.receipts.read(id);
      default: throw new SidefxError('ENTITY_REPRESENTATION_UNAVAILABLE', `No local representation for ${object}.`);
    }
  }

  async invoke(capabilityId, input, { verb = 'invoke', subject = capabilityId, route = null, object, command } = {}) {
    requireValue(input !== undefined || command, 'INPUT_REQUIRED', 'Supply canonical JSON with --input @file.json, --input JSON, or --input -.', 2);
    if (input !== undefined) assertJson(input);
    // Freeze the carrier before asynchronous inspection or receipt persistence.
    if (input !== undefined) input = JSON.parse(JSON.stringify(input));
    if (command) command = JSON.parse(JSON.stringify(command));
    const capability = await this.inspectCapability(capabilityId);
    if (command && capability.inputContractId === 'sfx-semantic-command.v1') {
      input = { contractId: capability.inputContractId, command };
    }
    requireValue(input !== undefined, 'INPUT_REQUIRED', 'Supply canonical JSON with --input @file.json, --input JSON, or --input -.', 2);
    if (route?.capsuleDigest) requireValue(route.capsuleDigest === capability.capsuleDigest,
      'ROUTE_STALE', 'The route is bound to another capsule digest. Review and update its binding.');
    if (route?.authorityDigest) requireValue(route.authorityDigest === capability.capabilityAuthorityDigest,
      'ROUTE_STALE', 'The route is bound to another capability authority. Review and update its binding.');
    const context = object === undefined ? route : { ...route, object, operation: verb };
    return this.receipts.execute({ verb, subject, input, capability,
      estateManifestDigest: capability.estateManifestDigest, context }, () => this.runtime.request('invoke', {
      capabilityId, input, capsuleDigest: capability.capsuleDigest, estateManifestDigest: capability.estateManifestDigest,
      ...(capability.runtimeManifestDigest ? { capabilityAuthorityDigest: capability.capabilityAuthorityDigest,
        runtimeManifestDigest: capability.runtimeManifestDigest } : {}),
    }));
  }

  async delegate(request) {
    const { object, verb, subject, via } = request;
    let input = request.input;
    if (input !== undefined) { assertJson(input); input = JSON.parse(JSON.stringify(input)); }
    const route = via
      ? { capabilityId: via, source: 'EXPLICIT_INVOCATION' }
      : await resolveRoute(this.routesPath ?? this.defaultRoutesPath, verb, subject, object);
    const context = object ? { ...route, object, operation: verb } : route;
    return this.invoke(route.capabilityId, input, { verb, subject: subject ?? '*', route: context, command: request });
  }

  async execute(request) {
    request = { ...request };
    if (request.input !== undefined) {
      assertJson(request.input);
      request.input = JSON.parse(JSON.stringify(request.input));
    }
    const object = request.object;
    if (object !== undefined) {
      const spec = validateSemanticRequest(request, { routes: Boolean(this.routesPath) });
      let configuredRoute = false;
      if (spec.bindable && this.defaultRoutesPath && !this.routesPath && !request.via) {
        try { await resolveRoute(this.defaultRoutesPath, request.verb, request.subject, object); configuredRoute = true; }
        catch (error) { if (error.code !== 'CAPABILITY_ROUTE_REQUIRED') throw error; }
      }
      if (!spec.projection || (spec.bindable && (request.via || this.routesPath || configuredRoute || request.input !== undefined))) {
        return this.delegate(request);
      }
      request = projectSemanticRequest(request);
    }
    const { verb, subject } = request;
    if (request.via || (request.input !== undefined && delegatedVerbs.includes(verb))) {
      requireValue(delegatedVerbs.includes(verb), 'OPTION_NOT_APPLICABLE', '--via only applies to delegated capability verbs.', 2);
      return this.delegate(request);
    }
    switch (verb) {
      case 'list':
        if (subject === 'executions') return { executions: await this.receipts.list() };
        if (subject === 'providers') return { providers: await this.catalog.records(), registered: await this.catalog.registered() };
        requireValue(!subject || subject === 'capabilities', 'COLLECTION_REJECTED', 'List capabilities, providers, or executions.', 2);
        {
          const response = await this.runtime.request('list');
          return object === 'capsule' ? { ...response, result: response.result.filter(item => item.capsuleDigest) } : response;
        }
      case 'find': return this.runtime.request('list', { query: subject });
      case 'search':
        return subject === 'estate' && object !== 'provider'
          ? this.runtime.request('list', { query: request.query })
          : { namespace: subject, evidenceScope: 'DISCOVERY_TESTIMONY', providers: await this.catalog.search(subject, request.query) };
      case 'inspect': return object === undefined ? this.inspect(subject) : this.readEntity(object, subject);
      case 'scenarios': {
        const capability = await this.inspectCapability(subject);
        return { capabilityId: subject, capsuleDigest: capability.capsuleDigest,
          rootScenarioId: capability.rootScenarioId, scenarios: capability.scenarios };
      }
      case 'reveal': {
        requireValue(!isProviderId(subject), 'PROVIDER_REPRESENTATION_UNAVAILABLE',
          'Provider discovery has no admitted blueprint. Inspect its descriptor or reveal an admitted capability identity.');
        const capability = await this.inspectCapability(subject);
        if (object === 'capsule') requireValue(capability.capsuleDigest, 'CAPSULE_UNAVAILABLE', 'The selected capability has no estate capsule.');
        return { capsuleDigest: capability.capsuleDigest, ...revealCapability(capability, request) };
      }
      case 'providers': {
        const capability = await this.inspectCapability(subject);
        return { capabilityId: subject, capsuleDigest: capability.capsuleDigest,
          bindingSource: capability.plan, boundMechanics: capability.providers,
          discoveryCandidates: (await this.catalog.records()).filter(provider => provider.candidateCapabilities.includes(subject)) };
      }
      case 'resolve': {
        if (this.routesPath && object === undefined) return this.delegate(request);
        const response = await this.runtime.request('resolve', { capabilityId: subject });
        return { ...response, resolutionScope: 'CURRENT_CAPSULE_AND_DECLARED_DEPENDENCIES' };
      }
      case 'invoke': return this.invoke(subject, request.input, { object });
      case 'evaluate': {
        if (object === undefined && (request.provider || isProviderId(subject) || this.routesPath)) return this.delegate(request);
        const capability = await this.inspectCapability(subject);
        requireValue(capability.capsuleDigest, 'CAPSULE_UNAVAILABLE', 'The selected capability has no estate capsule for fixture proof.');
        return this.receipts.execute({ verb, subject, capability, estateManifestDigest: capability.estateManifestDigest,
          context: { evaluationScope: 'CAPSULE_FIXTURE_PROOF', ...(object === undefined ? {} : { object, operation: verb }) } }, () => this.runtime.request('evaluate', {
          capabilityId: subject, capsuleDigest: capability.capsuleDigest, estateManifestDigest: capability.estateManifestDigest,
        }));
      }
      case 'observe': return this.receipts.read(subject);
      case 'explain': return explainReceipt(await this.receipts.read(subject));
      case 'compare': {
        if (this.routesPath && object === undefined) return this.delegate(request);
        const read = async id => object !== undefined ? this.readEntity(object, id)
          : isExecutionId(id) ? this.receipts.read(id) : this.inspect(id);
        const [left, right] = await Promise.all([read(subject), read(request.other)]);
        return { comparisonScope: 'STRUCTURAL_DIFFERENCE', left: subject, right: request.other,
          changes: structuralDiff(left, right) };
      }
      case 'provider':
        if (request.action === 'add') return this.catalog.add(subject);
        if (request.action === 'remove') return this.catalog.remove(subject);
        if (request.action === 'list') return { registered: await this.catalog.registered() };
        throw new SidefxError('PROVIDER_ACTION_REJECTED', 'Use sfx provider add, remove, or list.', 2);
      case 'verify': return this.runtime.request('verify');
      default:
        if (delegatedVerbs.includes(verb)) return this.delegate(request);
        throw new SidefxError('COMMAND_REJECTED', `Unknown command ${verb}. Run sfx --help.`, 2);
    }
  }
}
