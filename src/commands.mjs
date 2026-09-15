import { readFile } from 'node:fs/promises';
import { requireValue, SidefxError } from './errors.mjs';
import { bytesDigest } from './data.mjs';

// sfx owns its vocabulary as data, never as code. This module loads and validates that
// mapping. It knows nothing about capsules, plans, providers or authoring languages.
// The declared semantic cell altitudes of an observation operation. The terminal
// reads them to scope its stream; the estate remains the authority for meaning.
export const OBSERVATION_ALTITUDES = Object.freeze(['scenario', 'mechanic', 'provider', 'physical']);
const specFields = ['min', 'max', 'query', 'namespace', 'identity', 'view', 'scenarioOperand',
  'input', 'inputType', 'observation', 'observationAltitudes', 'format', 'display', 'workspace', 'targets', 'fullMechanics', 'codegenPatterns', 'wraps', 'status', 'missing', 'description'];
const requestFields = new Set(['object', 'verb', 'subject', 'other', 'query', 'scenario', 'as', 'format', 'display', 'input', 'inputType', 'namespace', 'observationAltitudes', 'workspace', 'targets', 'fullMechanics', 'codegenPatterns']);
const reserved = ['constructor', 'prototype', '__proto__'];
const flag = value => value === undefined || typeof value === 'boolean';
const name = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value) && !reserved.includes(value);

export async function loadCommandMapping(file) {
  const bytes = await readFile(file);
  let document;
  try { document = JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')); }
  catch (error) { throw new SidefxError('COMMAND_MAPPING_REJECTED', `Cannot read command mapping ${file}: ${error.message}`, 2); }
  requireValue(document?.mappingType === 'sfx-command-mapping.v1'
    && document.surfaces && typeof document.surfaces === 'object' && !Array.isArray(document.surfaces)
    && document.identities && typeof document.identities === 'object'
    && document.commands && typeof document.commands === 'object' && !Array.isArray(document.commands),
  'COMMAND_MAPPING_REJECTED', 'Expected sfx-command-mapping.v1 with surfaces, identities and commands.', 2);

  for (const [id, surface] of Object.entries(document.surfaces)) {
    const processBound = typeof surface?.delivery === 'string' && surface.delivery.length > 0;
    requireValue((processBound ? surface.capabilityId === undefined && surface.request === undefined
      && surface.rootRefField === undefined && surface.disposableParentRootRefField === undefined
      : surface?.delivery === undefined && typeof surface?.capabilityId === 'string' && surface.capabilityId.length > 0)
      && Array.isArray(surface.operations) && surface.operations.every(item => typeof item === 'string'),
    'COMMAND_MAPPING_REJECTED', `Surface ${id} requires exactly one capability or process delivery binding and its operations.`, 2);
    for (const field of ['rootRefField', 'disposableParentRootRefField']) {
      requireValue(surface[field] === undefined || typeof surface[field] === 'string'
        && /^[A-Za-z][A-Za-z0-9]*$/.test(surface[field]) && !reserved.includes(surface[field]),
      'COMMAND_MAPPING_REJECTED', `Surface ${id} has an invalid ${field}.`, 2);
    }
  }
  const identities = {};
  for (const [id, declared] of Object.entries(document.identities)) {
    requireValue(typeof declared?.pattern === 'string' && typeof declared.message === 'string',
      'COMMAND_MAPPING_REJECTED', `Identity contract ${id} requires a pattern and a message.`, 2);
    identities[id] = { test: new RegExp(declared.pattern, 'u'), message: declared.message };
  }

  const commands = {};
  for (const [object, operations] of Object.entries(document.commands)) {
    requireValue(name(object) && operations && typeof operations === 'object' && !Array.isArray(operations)
      && Object.keys(operations).length > 0,
    'COMMAND_MAPPING_REJECTED', `Invalid entity type: ${object}.`, 2);
    const declared = Object.create(null);
    for (const [verb, spec] of Object.entries(operations)) {
      requireValue(name(verb) && spec && typeof spec === 'object' && !Array.isArray(spec)
        && Object.keys(spec).every(key => specFields.includes(key))
        && Number.isInteger(spec.min) && spec.min >= 0 && spec.min <= 2
        && (spec.max === null ? spec.query === true : Number.isInteger(spec.max) && spec.max >= spec.min && spec.max <= 2)
        && flag(spec.query) && flag(spec.namespace) && flag(spec.view) && flag(spec.scenarioOperand) && flag(spec.input) && flag(spec.inputType) && flag(spec.observation) && flag(spec.observationAltitudes) && flag(spec.format) && flag(spec.display)
        && flag(spec.workspace) && flag(spec.targets) && flag(spec.fullMechanics) && flag(spec.codegenPatterns)
        && (spec.identity === undefined || Object.hasOwn(identities, spec.identity))
        && (spec.description === undefined || typeof spec.description === 'string'),
      'COMMAND_MAPPING_REJECTED', `Invalid operation: ${object} ${verb}.`, 2);
      // Every command is either wrapped or explicitly recorded as not yet offered.
      const offered = Object.hasOwn(spec, 'wraps');
      requireValue(offered !== (spec.status === 'MISSING'), 'COMMAND_MAPPING_REJECTED',
        `${object} ${verb} must either wrap an estate operation or be marked MISSING.`, 2);
      if (offered) {
        const surface = document.surfaces[spec.wraps.surface];
        requireValue(surface && surface.operations.includes(spec.wraps.operation),
          'COMMAND_MAPPING_REJECTED', `${object} ${verb} wraps an operation its surface does not declare.`, 2);
        requireValue(!surface.delivery || spec.wraps.fields === undefined,
          'COMMAND_MAPPING_REJECTED', `${object} ${verb}: process delivery preserves the complete request without field templates.`, 2);
      } else {
        requireValue(typeof spec.missing?.need === 'string', 'COMMAND_MAPPING_REJECTED',
          `${object} ${verb} is MISSING and must record what the estate needs to offer.`, 2);
      }
      declared[verb] = Object.freeze({ ...spec, max: spec.max ?? Infinity, offered });
    }
    commands[object] = Object.freeze(declared);
  }
  return Object.freeze({ commands: Object.freeze(commands), surfaces: document.surfaces,
    identities, digest: bytesDigest(bytes), file });
}

function required(mapping) {
  requireValue(mapping, 'COMMAND_MAPPING_REQUIRED', 'No command mapping is loaded.');
  return mapping;
}

export const isSemanticObject = (object, mapping) =>
  typeof object === 'string' && Boolean(mapping) && Object.hasOwn(mapping.commands, object);

export function semanticCommand(object, verb, mapping) {
  return isSemanticObject(object, mapping) && typeof verb === 'string' && Object.hasOwn(mapping.commands[object], verb)
    ? mapping.commands[object][verb] : null;
}

export function parseSemanticCommand([object, verb, ...operands], mapping) {
  const spec = semanticCommand(object, verb, required(mapping));
  requireValue(spec, 'COMMAND_REJECTED', `Unknown operation for ${object}. Run sfx --help.`, 2);
  requireValue(operands.length >= spec.min && operands.length <= spec.max,
    'USAGE_ERROR', `Wrong operands for sfx ${object} ${verb}. Run sfx --help.`, 2);
  if (spec.query) return { object, verb, query: operands.join(' ') };
  return { object, verb, subject: operands[0], ...(spec.scenarioOperand
    ? { scenario: operands[1] } : operands.length === 2 ? { other: operands[1] } : {}) };
}

export function validateSemanticRequest(request, mapping) {
  requireValue(Reflect.ownKeys(request).every(field => requestFields.has(field)), 'REQUEST_FIELD_REJECTED',
    'Use the canonical command fields; entity-specific data belongs inside input.', 2);
  const { object, verb, subject, other } = request;
  const spec = semanticCommand(object, verb, required(mapping));
  requireValue(spec, 'COMMAND_REJECTED', `Unknown ${object} operation ${verb}. Run sfx --help.`, 2);
  const present = value => typeof value === 'string' && value.length > 0;
  requireValue(spec.query ? (request.query === undefined && spec.min === 0)
    || (typeof request.query === 'string' && (!spec.min || request.query.length > 0))
    : spec.min ? present(subject) : subject === undefined,
  'USAGE_ERROR', `Invalid operands for sfx ${object} ${verb}.`, 2);
  requireValue(spec.query ? subject === undefined : request.query === undefined,
    'USAGE_ERROR', 'A query applies only to a declared query operation.', 2);
  requireValue(spec.max === 2 && !spec.scenarioOperand ? present(other) : other === undefined,
    'USAGE_ERROR', 'A second identity applies only to comparison.', 2);
  if (spec.scenarioOperand) requireValue(present(request.scenario), 'USAGE_ERROR', 'Supply capability and scenario identities.', 2);
  if (!spec.query && spec.min && spec.identity) {
    const contract = mapping.identities[spec.identity];
    const identities = other === undefined ? [subject] : [subject, other];
    requireValue(identities.every(value => contract.test.test(value)), 'IDENTITY_REJECTED', contract.message, 2);
  }
  requireValue(request.as === undefined || spec.view === true,
    'OPTION_NOT_APPLICABLE', '--as applies to operations declaring a selectable view.', 2);
  requireValue(request.format === undefined || spec.format === true,
    'OPTION_NOT_APPLICABLE', '--format applies only to operations declaring a selectable presentation.', 2);
  requireValue(request.display === undefined || spec.display === true,
    'OPTION_NOT_APPLICABLE', '--display applies only to operations declaring a display projection.', 2);
  requireValue(request.inputType === undefined || spec.inputType === true,
    'OPTION_NOT_APPLICABLE', '--input-type applies only to operations declaring a typed input.', 2);
  requireValue(request.inputType === undefined || ['json', 'text', 'number', 'boolean'].includes(request.inputType),
    'USAGE_ERROR', '--input-type must be json, text, number or boolean.', 2);
  requireValue(request.observationAltitudes === undefined || (spec.observation === true
    && Array.isArray(request.observationAltitudes)
    && request.observationAltitudes.length > 0
    && request.observationAltitudes.every(value => OBSERVATION_ALTITUDES.includes(value))),
  'OPTION_NOT_APPLICABLE', '--observation-altitude applies only to observation operations and names a semantic altitude.', 2);
  requireValue(request.scenario === undefined || spec.scenarioOperand || spec.view === true,
    'OPTION_NOT_APPLICABLE', 'Scenario selection applies to scenario operands and selectable views.', 2);
  requireValue(request.input === undefined || spec.input === true,
    'OPTION_NOT_APPLICABLE', '--input applies only to operations declaring canonical input.', 2);
  requireValue(request.namespace === undefined || spec.namespace === true,
    'OPTION_NOT_APPLICABLE', '--namespace applies only to operations declaring it.', 2);
  requireValue(request.workspace === undefined || spec.workspace === true,
    'OPTION_NOT_APPLICABLE', '--workspace applies only to operations declaring a projection workspace.', 2);
  requireValue(request.workspace === undefined || (typeof request.workspace === 'string' && request.workspace.length > 0),
    'USAGE_ERROR', '--workspace requires a directory path.', 2);
  requireValue(request.targets === undefined || spec.targets === true,
    'OPTION_NOT_APPLICABLE', '--targets applies only to operations declaring projection targets.', 2);
  requireValue(request.targets === undefined || (Array.isArray(request.targets) && request.targets.length > 0
    && request.targets.every(target => typeof target === 'string' && target.length > 0)),
  'USAGE_ERROR', '--targets must name at least one projection target.', 2);
  requireValue(request.fullMechanics === undefined || spec.fullMechanics === true,
    'OPTION_NOT_APPLICABLE', '--full-mechanics applies only to operations declaring the complete mechanical projection.', 2);
  requireValue(request.fullMechanics === undefined || request.fullMechanics === true,
    'USAGE_ERROR', '--full-mechanics carries no value.', 2);
  requireValue(request.codegenPatterns === undefined || spec.codegenPatterns === true,
    'OPTION_NOT_APPLICABLE', '--codegen-pattern applies only to operations declaring codegen pattern selection.', 2);
  requireValue(request.codegenPatterns === undefined || (Array.isArray(request.codegenPatterns) && request.codegenPatterns.length > 0
    && request.codegenPatterns.every(pattern => typeof pattern === 'string' && pattern.length > 0)),
  'USAGE_ERROR', '--codegen-pattern must name at least one execution pattern type.', 2);
  return spec;
}
