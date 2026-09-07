import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireValue, SidefxError } from './errors.mjs';

// sfx invokes the estate's own delivery capabilities through the bootstrap's declared bin.
// It never imports the bootstrap or reads a capsule. Everything below is transport.
const bootstrapPackage = 'sda-bootstrap';

export function repositoryRootRef(estateRoot) {
  const resolved = path.resolve(estateRoot);
  // A file: URI is the portable carrier the estate's contract requires. No machine
  // identity, checkout path or tool root is embedded anywhere else.
  return pathToFileURL(resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`).href;
}

async function bootstrapEntry(estateRoot) {
  const root = path.join(path.resolve(estateRoot), 'node_modules', bootstrapPackage);
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); }
  catch {
    throw new SidefxError('ESTATE_RUNTIME_REQUIRED',
      `Install the estate's pinned dependencies in ${estateRoot} (npm ci).`);
  }
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bootstrapPackage];
  requireValue(typeof bin === 'string' && bin.length > 0, 'ESTATE_RUNTIME_REJECTED',
    `${bootstrapPackage} declares no ${bootstrapPackage} entry point.`, 4);
  return path.join(root, bin);
}

export async function deliver({ estateRoot, capabilityId, request, timeoutMs = 120_000 }) {
  requireValue(estateRoot, 'ESTATE_REQUIRED', 'Select an estate with --estate PATH or SIDEFX_ESTATE.');
  const entry = await bootstrapEntry(estateRoot);
  const cwd = path.resolve(estateRoot);
  const env = { ...process.env, CAPSULE_SOURCE_REPOSITORY_ROOT: cwd };
  // A published-estate consumer cannot inherit experimental runtime substitutions.
  for (const key of ['CAPSULE_INVOKE_OVERLAY_ROOT', 'CAPSULE_INVOKE_REPLACEMENT_IDS', 'SIDEFX_PLATFORM_ROOT']) delete env[key];

  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, 'invoke', capabilityId],
      { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    let diagnostics = '';
    let failure;
    const stop = (code, message) => { failure ??= new SidefxError(code, message, 4); child.kill(); };
    const timer = setTimeout(() => stop('DELIVERY_TIMEOUT',
      `Delivery exceeded ${timeoutMs}ms; external effects may be incomplete.`), timeoutMs);
    const interrupt = () => stop('DELIVERY_INTERRUPTED', 'Delivery was interrupted; effects may have occurred.');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) stop('DELIVERY_OUTPUT_LIMIT', 'Delivery output exceeded 32 MiB.');
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-16_384); });
    child.on('error', () => { failure ??= new SidefxError('ESTATE_RUNTIME_REQUIRED',
      `Could not start the estate runtime in ${estateRoot}.`, 4); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      if (failure) return reject(failure);
      const text = Buffer.concat(chunks).toString('utf8');
      if (code !== 0 && !text.trim()) {
        return reject(new SidefxError('DELIVERY_FAILED', `Estate delivery exited ${code}. ${diagnostics.trim()}`, 4));
      }
      resolve(text);
    });
    child.stdin.end(JSON.stringify(request));
  });

  try { return JSON.parse(stdout); }
  catch { throw new SidefxError('DELIVERY_PROTOCOL_REJECTED', 'The estate returned no canonical JSON result.', 4); }
}
