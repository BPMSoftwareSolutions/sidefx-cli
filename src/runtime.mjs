import { fork } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidefxError, requireValue } from './errors.mjs';

const worker = fileURLToPath(new URL('./runtime-worker.mjs', import.meta.url));

export class EstateRuntime {
  constructor({ estateRoot, timeoutMs = 120_000 }) {
    this.estateRoot = estateRoot && path.resolve(estateRoot);
    this.timeoutMs = timeoutMs;
    requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647,
      'INVALID_TIMEOUT', 'Timeout must be a positive number of milliseconds below 2147483648.', 2);
  }

  async request(operation, fields = {}) {
    requireValue(this.estateRoot, 'ESTATE_REQUIRED', 'Select an estate with --estate PATH or SIDEFX_ESTATE.');
    const bootstrap = path.join(this.estateRoot, 'node_modules', 'sda-bootstrap', 'src', 'capsule-manager.mjs');
    try { await access(bootstrap); } catch {
      throw new SidefxError('RUNTIME_REQUIRED', `Install the estate\'s pinned dependencies in ${this.estateRoot} (npm ci).`);
    }
    const env = { ...process.env, CAPSULE_SOURCE_REPOSITORY_ROOT: this.estateRoot };
    // A published-estate consumer cannot inherit experimental runtime substitutions.
    for (const key of ['CAPSULE_INVOKE_OVERLAY_ROOT', 'CAPSULE_INVOKE_REPLACEMENT_IDS', 'SIDEFX_PLATFORM_ROOT']) delete env[key];
    return new Promise((resolve, reject) => {
      const child = fork(worker, [], {
        cwd: this.estateRoot, env, execArgv: [], windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json',
      });
      let response;
      let diagnostics = '';
      let timedOut = false;
      const capture = chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-16_384); };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, this.timeoutMs);
      const interrupt = () => child.kill();
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      const cleanup = () => {
        clearTimeout(timer);
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
      };
      child.on('message', message => { response = message; });
      child.on('error', error => { cleanup(); reject(new SidefxError('RUNTIME_START_FAILED', error.message, 4)); });
      child.on('close', (code, signal) => {
        cleanup();
        if (timedOut) return reject(new SidefxError('RUNTIME_TIMEOUT',
          `Runtime exceeded ${this.timeoutMs}ms; external effects and runtime cleanup may be incomplete.`, 4));
        if (response?.ok && code === 0) return resolve(response.value);
        reject(new SidefxError(response?.error?.code ?? 'RUNTIME_FAILED',
          response?.error?.message ?? `Runtime exited ${code ?? signal}. ${diagnostics.trim()}`, 4));
      });
      child.send({ bootstrap, operation, ...fields }, error => {
        if (error) child.kill();
      });
    });
  }
}
