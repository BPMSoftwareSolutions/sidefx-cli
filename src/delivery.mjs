import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireValue, SidefxError } from './errors.mjs';
import { readDeliveryResult } from './delivery-result.mjs';

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

  return runProcess({ command: process.execPath, args: [entry, 'invoke', capabilityId], cwd, env, request, timeoutMs });
}

// An explicit binding selects the transport. It receives the same closed command
// from CLI and SDK; its implementation owns authority selection and interpretation.
export async function deliverCommand({ binding, operation, request, timeoutMs = 120_000 }) {
  requireValue(binding, 'DELIVERY_BINDING_REQUIRED', 'The selected surface has no configured process delivery.', 4);
  requireValue(binding.type === 'process' && typeof binding.command === 'string' && binding.command.length > 0
    && Array.isArray(binding.args) && binding.args.every(arg => typeof arg === 'string')
    && typeof binding.cwd === 'string' && binding.cwd.length > 0,
  'DELIVERY_BINDING_REJECTED', 'Expected a process command, args and cwd.', 4);
  return runProcess({ ...binding, env: process.env, timeoutMs,
    request: { deliveryType: 'sfx-command-delivery.v1', operation, request } });
}

function runProcess({ command, args, cwd, env, request, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args,
      { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let diagnostics = '';
    let failure;
    const stop = (code, message) => { failure ??= new SidefxError(code, message, 4); child.kill(); };
    const timer = setTimeout(() => stop('DELIVERY_TIMEOUT',
      `Delivery exceeded ${timeoutMs}ms; external effects may be incomplete.`), timeoutMs);
    const interrupt = () => stop('DELIVERY_INTERRUPTED', 'Delivery was interrupted; effects may have occurred.');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    let result, protocolFailure;
    let receivedOutput = false;
    child.stdout.once('data', () => { receivedOutput = true; });
    const parsed = readDeliveryResult(child.stdout).then(value => { result = value; }, error => {
      protocolFailure = error;
      child.kill();
    });
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-16_384); });
    child.on('error', () => { failure ??= new SidefxError('ESTATE_RUNTIME_REQUIRED',
      `Could not start the selected runtime in ${cwd}.`, 4); });
    child.stdin.on('error', () => {});
    child.on('close', async code => {
      await parsed;
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      if (failure) return reject(failure);
      if (code !== 0 && !receivedOutput) {
        return reject(new SidefxError('DELIVERY_FAILED', `Estate delivery exited ${code}. ${diagnostics.trim()}`, 4));
      }
      if (protocolFailure) return reject(protocolFailure);
      resolve(result);
    });
    child.stdin.end(JSON.stringify(request));
  });
}
