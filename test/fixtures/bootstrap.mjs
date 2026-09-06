// A protocol test double. This is not an executable SideFX capability estate.
import { readFileSync } from 'node:fs';
import { capsuleFixture } from './helpers.mjs';

export function loadEstate() {
  return { records: [{ capsule: capsuleFixture().capsule }] };
}
export function verifyEstate() {
  const manifest = JSON.parse(readFileSync('capsules/capsule-estate.manifest.json', 'utf8'));
  if (manifest.corrupt) throw new Error('CAPSULE_DIGEST_DIVERGED: corrupt fixture');
  return { capabilityCount: 1, entryCount: 3 };
}
export function inspectCapsule(id) {
  if (id !== 'observe-example') throw new Error('CAPSULE_NOT_FOUND: unknown fixture capability');
  return capsuleFixture().inspection;
}
export function listCapsules() { return [capsuleFixture().inspection]; }
export function resolveEstate() { return { status: 'RESOLVED' }; }
export function assertCollapsedRepository() { return { expandedCapabilityRoot: 'ABSENT' }; }
export async function invokeCapability(id, input) {
  process.stdout.write('provider diagnostic text\n');
  process.stderr.write('additional diagnostic text\n');
  if (input.wait) await new Promise(resolve => setTimeout(resolve, input.wait));
  if (input.fail) throw new Error('CONTRACT_REJECTED: exact fixture rejection');
  return { capabilityId: id, input, disposition: 'terminated',
    overridePresent: Boolean(process.env.CAPSULE_INVOKE_OVERLAY_ROOT || process.env.SIDEFX_PLATFORM_ROOT || process.env.CAPSULE_INVOKE_REPLACEMENT_IDS) };
}
export function proveDirectExecution(estate, selected) {
  process.stdout.write('TAP version 13\nok 1 - fixture\n');
  return { capabilityIds: [...selected], status: 'GREEN' };
}
