// Rebind explicitly listed local artifacts after reviewing a provider/configuration change.
// This records local file identities; it is not estate admission or a proof generator.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolveRuntimeArtifact } from '../src/runtime-artifacts.mjs';

const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error('Usage: node scripts/bind-runtime.mjs <runtime-manifest.json>');
const manifest = JSON.parse(await readFile(file, 'utf8'));
if (manifest.runtimeType !== 'sfx-process-runtime.v1' || !manifest.artifacts) throw new Error('Invalid process runtime manifest.');
for (const reference of Object.keys(manifest.artifacts)) {
  const bytes = await readFile(resolveRuntimeArtifact(reference, path.resolve(file)));
  manifest.artifacts[reference] = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Bound ${Object.keys(manifest.artifacts).length} local runtime artifacts.\n`);
