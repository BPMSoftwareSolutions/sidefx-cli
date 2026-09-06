import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { SidefxError } from './errors.mjs';

export function assertJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return;
  if (typeof value !== 'object' || ancestors.has(value)
    || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
    throw new SidefxError('JSON_VALUE_REJECTED', 'Canonical input must contain only finite JSON values without cycles.', 2);
  }
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) assertJson(child, ancestors);
  ancestors.delete(value);
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

export function bytesDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function readJson(file) {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new SidefxError('JSON_READ_FAILED', `Cannot read JSON from ${file}: ${error.message}`, 2);
  }
}

export async function writeJson(file, value, { exclusive = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (exclusive) {
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    return;
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

// This is storage hygiene, not an assertion that arbitrary provider text is safe.
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      /^(authorization|proxy-authorization|cookie|set-cookie|password|secret|token|access[_-]?token|refresh[_-]?token)$/i.test(key)
        || /(?:^|[-_])[a-z0-9]*api[-_]?key$/i.test(key)
        ? '[REDACTED]' : redact(child),
    ]));
  }
  return value;
}
