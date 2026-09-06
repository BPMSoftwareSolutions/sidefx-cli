import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const requireValue = (value, code, message) => { if (!value) fail(code, message); };
const parse = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const within = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// JSON Pointer plus an array/object wildcard. No executable expressions, name
// inference, recursive identity guessing, or provider-specific schema dispatch.
function select(value, pointer = '') {
  requireValue(typeof pointer === 'string' && (!pointer || pointer.startsWith('/')),
    'DISCOVERY_POLICY_REJECTED', 'Selectors must be JSON pointers.');
  let values = [value];
  for (const token of pointer.split('/').slice(1)) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    values = values.flatMap(item => !item || typeof item !== 'object' ? []
      : key === '*' ? Object.values(item) : Object.hasOwn(item, key) ? [item[key]] : []);
  }
  return values;
}

function project(spec, context) {
  if (Object.hasOwn(spec, 'value')) return spec.value;
  const values = select(context[spec.from ?? 'record'], spec.path).filter(value => value != null);
  return spec.array ? values.flat() : values[0];
}

function matches(document, rule) {
  if (rule.sourceStates && !rule.sourceStates.includes(document.state)) return false;
  if (rule.referencePattern && !new RegExp(rule.referencePattern).test(document.reference)) return false;
  return Object.entries(rule.when ?? {}).every(([pointer, test]) => select(document.value, pointer).some(value =>
    test.exists === true || (Object.hasOwn(test, 'equals') && equal(value, test.equals))
      || (test.oneOf && test.oneOf.some(item => equal(item, value)))
      || (test.pattern && typeof value === 'string' && new RegExp(test.pattern).test(value))));
}

export async function discover(policyFile, command) {
  const policyBytes = await readFile(policyFile);
  const policy = parse(policyBytes);
  requireValue(policy.discoveryPolicyType === 'json-entity-discovery.v1' && Array.isArray(policy.sources)
    && Array.isArray(policy.projections) && policy.collections, 'DISCOVERY_POLICY_REJECTED', 'Invalid discovery policy.');
  const collection = policy.collections[command.object];
  requireValue(collection && ['list', 'search', 'find', 'inspect'].includes(command.verb),
    'DISCOVERY_REQUEST_REJECTED', 'The policy does not expose this entity operation.');
  requireValue(command.input === undefined && (command.query === undefined || typeof command.query === 'string'),
    'DISCOVERY_REQUEST_REJECTED', 'Discovery accepts the declared command fields only.');
  const root = await realpath(path.resolve(path.dirname(policyFile), policy.root));
  const observed = new Map();
  const documents = [];
  const coverage = [];
  const limit = policy.maximumFileBytes ?? 64 * 1024 * 1024;
  async function read(reference, expected) {
    const file = path.resolve(root, reference);
    requireValue(within(root, file), 'DISCOVERY_SOURCE_REJECTED', 'A source escapes the declared root.');
    const relative = path.relative(root, file);
    let parent = root;
    for (const part of relative.split(path.sep)) {
      parent = path.join(parent, part);
      requireValue(!(await lstat(parent)).isSymbolicLink(), 'DISCOVERY_SOURCE_REJECTED', 'Source links are not followed.');
    }
    const stat = await lstat(file);
    requireValue(stat.isFile() && stat.size <= limit, 'DISCOVERY_SOURCE_REJECTED', 'Source exceeds the file bound.');
    const bytes = await readFile(file);
    const digest = hash(bytes);
    requireValue(!expected || expected === digest, 'DISCOVERY_DIGEST_MISMATCH', `Source digest changed: ${reference}`);
    requireValue(!observed.has(file) || observed.get(file) === digest, 'DISCOVERY_SOURCE_CHANGED', 'Sources changed during discovery.');
    observed.set(file, digest);
    return { value: parse(bytes), digest, reference: relative.split(path.sep).join('/') };
  }
  async function tree(reference, suffixes, excludes = []) {
    const directory = path.resolve(root, reference);
    requireValue(within(root, directory) && !(await lstat(directory)).isSymbolicLink(),
      'DISCOVERY_SOURCE_REJECTED', 'A source directory escapes the root or is a link.');
    const files = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.posix.join(reference.split(path.sep).join('/'), entry.name);
      if (excludes.some(pattern => new RegExp(pattern).test(child))) continue;
      requireValue(!entry.isSymbolicLink(), 'DISCOVERY_SOURCE_REJECTED', 'Source links are not followed.');
      if (entry.isDirectory()) files.push(...await tree(child, suffixes, excludes));
      else if (entry.isFile() && suffixes.some(suffix => entry.name.endsWith(suffix))) files.push(child);
    }
    return files;
  }
  function add(document, source) {
    documents.push({ ...document, state: source.state, container: document.value, containerDigest: document.digest });
    if (!source.embedded) return;
    const { rows, reference, content, digest } = source.embedded;
    for (const entry of select(document.value, rows)) {
      const ref = select(entry, reference)[0];
      const encoded = select(entry, content)[0];
      const expected = select(entry, digest)[0];
      requireValue(typeof ref === 'string' && typeof encoded === 'string' && typeof expected === 'string',
        'DISCOVERY_SOURCE_REJECTED', 'Embedded records require references, bytes, and digests.');
      const bytes = Buffer.from(encoded, 'base64');
      requireValue(hash(bytes) === expected, 'DISCOVERY_DIGEST_MISMATCH', `Embedded source digest changed: ${ref}`);
      if (!ref.endsWith('.json')) continue;
      documents.push({ value: parse(bytes), reference: `${document.reference}#${ref}`, digest: expected,
        state: source.state, container: document.value, containerDigest: document.digest });
    }
  }
  for (const source of policy.sources) {
    let files;
    if (source.kind === 'manifest') {
      const manifest = await read(source.path);
      const rows = select(manifest.value, source.rows);
      if (source.count) requireValue(select(manifest.value, source.count)[0] === rows.length,
        'DISCOVERY_SOURCE_REJECTED', 'Manifest count disagrees with its records.');
      files = rows.map(record => ({ path: path.join(source.root, select(record, source.reference)[0]),
        digest: select(record, source.digest)[0] }));
      requireValue(files.every(file => typeof file.digest === 'string'), 'DISCOVERY_SOURCE_REJECTED', 'Manifest records require digests.');
    } else if (source.kind === 'tree') {
      files = (await tree(source.root, source.suffixes, source.excludes)).map(file => ({ path: file }));
    } else fail('DISCOVERY_POLICY_REJECTED', 'Unknown source reader.');
    const before = documents.length;
    for (const file of files) add(await read(file.path, file.digest), source);
    coverage.push({ sourceId: source.sourceId, state: source.state, files: files.length, documents: documents.length - before });
  }

  const entities = new Map();
  for (const document of documents) for (const rule of policy.projections) {
    if (rule.object !== command.object || !matches(document, rule)) continue;
    for (const record of select(document.value, rule.rows ?? '')) {
      const context = { record, document: document.value, container: document.container };
      const identity = project(rule.identity, context);
      if (typeof identity !== 'string' || !identity.length) continue;
      const fields = Object.fromEntries(Object.entries(rule.fields ?? {}).map(([key, spec]) => [key, project(spec, context)])
        .filter(([, value]) => value !== undefined));
      const state = rule.state ?? document.state;
      const entity = entities.get(identity) ?? { ...structuredClone(collection.defaults ?? {}),
        entityType: command.object, identity, [collection.identityField]: identity,
        name: fields.name ?? identity, states: [], sources: [], variants: [] };
      for (const [key, value] of Object.entries(fields)) {
        if (Array.isArray(value)) entity[key] = [...new Map([...(entity[key] ?? []), ...value].map(item => [JSON.stringify(item), item])).values()];
        else if (!Object.hasOwn(entity, key) || (key === 'name' && entity.name === identity)) entity[key] = value;
      }
      if (!entity.states.includes(state)) entity.states.push(state);
      const source = { reference: document.reference, digest: document.digest, containerDigest: document.containerDigest, state };
      if (!entity.sources.some(item => equal(item, source))) entity.sources.push(source);
      const variant = { state, ...fields };
      if (!entity.variants.some(item => equal(item, variant))) entity.variants.push(variant);
      entities.set(identity, entity);
    }
  }
  // Recheck observed bytes before returning a result from one source generation.
  for (const [file, digest] of observed) requireValue(hash(await readFile(file)) === digest,
    'DISCOVERY_SOURCE_CHANGED', 'Sources changed during discovery.');
  const metadata = { discoveryScope: 'DECLARED_ESTATE_SOURCES', policyDigest: hash(policyBytes), coverage,
    snapshotDigest: hash(JSON.stringify([...observed].map(([file, digest]) => [path.relative(root, file).split(path.sep).join('/'), digest]))),
    totalCount: entities.size };
  const records = [...entities.values()].sort((a, b) => a.identity.localeCompare(b.identity)).map(entity => ({
    ...entity, descriptorDigest: hash(JSON.stringify(entity)),
  }));
  if (command.verb === 'inspect') {
    const record = records.find(item => item.identity === command.subject);
    requireValue(record, 'ENTITY_NOT_FOUND', `No ${command.object} declaration for ${command.subject}.`);
    return { ...record, ...metadata };
  }
  const terms = (command.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = records.filter(record => (!command.namespace || record.identity.startsWith(`${command.namespace}/`))
    && terms.every(term => JSON.stringify(record).toLowerCase().includes(term)));
  return { ...metadata, query: command.query ?? '', namespace: command.namespace ?? null,
    matchCount: filtered.length, [collection.resultField]: filtered };
}

async function main() {
  let request;
  try {
    request = parse(readFileSync(0));
    const authorityBytes = await readFile(process.argv[3]);
    const authority = parse(authorityBytes);
    requireValue(request.protocol === 'sfx-runtime-request.v1' && request.capabilityId === authority.capabilityId
      && request.capabilityAuthorityDigest === hash(authorityBytes), 'DISCOVERY_AUTHORITY_REJECTED', 'Invocation authority does not match.');
    const result = await discover(process.argv[2], request.command ?? request.input);
    process.stdout.write(JSON.stringify({ protocol: 'sfx-runtime-response.v1', capabilityId: request.capabilityId, result }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ protocol: 'sfx-runtime-response.v1', capabilityId: request?.capabilityId,
      error: { code: error.code ?? 'DISCOVERY_FAILED', message: error.code ? error.message : 'Discovery could not read the declared sources.' } }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
