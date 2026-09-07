import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requireValue, SidefxError } from './errors.mjs';
import { loadCommandMapping } from './commands.mjs';

// sfx ships its own vocabulary because the vocabulary is sfx. A project may point at a
// different mapping, but there is no second, compiled-in table behind this one.
const shippedMapping = fileURLToPath(new URL('../sfx.commands.json', import.meta.url));

export async function loadConfiguration(configPath, cwd = process.cwd()) {
  // sfx.config.json is the consumer's own project file. sfx never reads configuration out
  // of the selected estate: the estate declares capabilities, not this terminal's setup.
  const file = configPath ? path.resolve(cwd, configPath) : path.resolve(cwd, 'sfx.config.json');
  let document;
  try { document = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')); }
  catch (error) {
    if (!configPath && error.code === 'ENOENT') return { mapping: await loadCommandMapping(shippedMapping) };
    throw new SidefxError('CONFIGURATION_REJECTED', `Cannot load configuration: ${file}`, 2);
  }
  requireValue(document?.configurationType === 'sfx-project.v1'
    && Object.keys(document).every(key => ['configurationType', 'estate', 'commands'].includes(key))
    && (document.estate === undefined || (typeof document.estate === 'string' && document.estate.length > 0))
    && (document.commands === undefined || typeof document.commands === 'string'),
  'CONFIGURATION_REJECTED', 'Expected sfx-project.v1 with an estate and an optional command mapping.', 2);
  const resolve = value => path.resolve(path.dirname(file), value);
  return {
    ...(document.estate === undefined ? {} : { estateRoot: resolve(document.estate) }),
    mapping: await loadCommandMapping(document.commands === undefined ? shippedMapping : resolve(document.commands)),
  };
}
