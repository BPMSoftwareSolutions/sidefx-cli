import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { bytesDigest } from '../src/data.mjs';

export async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sfx-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

export function capsuleFixture(id = 'observe-example') {
  const encode = (entryId, value, entryRef = entryId) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return { entryId, entryRef, entryDigest: bytesDigest(bytes), entryBytesBase64: bytes.toString('base64') };
  };
  const scenario = { scenarioId: id, input: { inputId: 'example-input', contract: { contractId: 'example.v1' } },
    event: { eventId: 'example-requested' }, outcome: { outcomeId: 'example-outcome', terminal: true } };
  const entries = [
    encode('capability.authority.json', { capabilityId: id, name: 'Observe Example', rootScenarioId: id,
      userStory: { intent: 'Observe an example.' }, experience: { promise: 'An example is observable.' } }),
    encode('blueprint.authority.json', { nodes: [{ nodeId: id }], sourceAuthority: { disposition: 'ADMITTED' } }),
    encode('plan', { executionEmbodimentPlanType: 'consumer-execution-embodiment-plan.v2', rootNodeId: id,
      nodes: [{ nodeId: id, scenario, operations: [], transition: null }], mechanicBindings: [
        { bindingId: 'example-port', mechanicType: 'event-port', providerCapabilityId: 'example-provider.v1' },
        { bindingId: 'contracts', mechanicType: 'contract-admission', configuration: { contractAuthorities: { contracts: {
          'example.v1': { schema: { type: 'object', required: ['location'] } },
        } } } },
      ] }),
  ];
  return {
    inspection: { capabilityId: id, capabilityVersion: '1.0.0', capsuleDigest: `sha256:${'a'.repeat(64)}`,
      capabilityAuthorityDigest: entries[0].entryDigest, declaredDependencies: [], fixtures: [], entries: [] },
    capsule: { capabilityId: id, runtimeBindings: [{ planEntryRef: 'plan' }], entries },
  };
}

export function fakeRuntime({ output = { disposition: 'terminated', outcome: { payload: { disposition: 'PROVIDER_REQUIRED' } } }, failure } = {}) {
  const calls = [];
  return { calls, async request(operation, fields) {
    calls.push({ operation, ...fields });
    if (operation === 'inspect') return { estateManifestDigest: 'estate-generation-one', result: capsuleFixture(fields.capabilityId) };
    if (failure) throw failure;
    return { estateManifestDigest: 'estate-generation-one', result: output };
  } };
}
