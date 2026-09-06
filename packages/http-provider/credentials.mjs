import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function resolveCredential(reference) {
  if (!reference) return null;
  if (reference.kind !== 'environment' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference.name)
    || !['process', 'user'].includes(reference.scope)) throw new Error('CREDENTIAL_REFERENCE_REJECTED');
  let value;
  if (reference.scope === 'process') value = process.env[reference.name];
  else if (process.platform === 'win32') {
    // Fixed OS operation; a credential name is an argument, never shell source.
    try {
      const { stdout } = await run('reg.exe', ['query', 'HKCU\\Environment', '/v', reference.name],
        { windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf8', shell: false });
      const line = stdout.split(/\r?\n/).find(line => line.trimStart().startsWith(`${reference.name} `));
      value = line?.match(/\s+REG_SZ\s+(.+)$/)?.[1];
    } catch { /* Missing/unreadable credential is a declared outcome, with no native diagnostics. */ }
  }
  if (typeof value !== 'string' || !value.length || value.length > 16384 || /[\r\n\0]/.test(value)) {
    throw new Error('CREDENTIAL_UNAVAILABLE');
  }
  return value;
}

export function redact(value, credential) {
  if (Array.isArray(value)) return value.map(item => redact(item, credential));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    redact(key, credential), /^(authorization|proxy-authorization|cookie|set-cookie|password|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key)$/i.test(key)
      ? '[REDACTED]' : redact(item, credential),
  ]));
  if (typeof value !== 'string' || !credential) return value;
  for (const representation of new Set([credential, encodeURIComponent(credential), Buffer.from(credential).toString('base64')])) {
    value = value.split(representation).join('[REDACTED]');
  }
  return value;
}
