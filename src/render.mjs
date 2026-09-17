import { semanticCommand } from './commands.mjs';
import { SidefxError } from './errors.mjs';

const pretty = value => JSON.stringify(value, null, 2);
const safe = value => String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const section = (name, value) => `${name}\n${'-'.repeat(name.length)}\n${value}`;
const list = (values, format = value => value) => values.length ? values.map(format).join('\n') : '(none)';

// Rendering is presentation over a canonical estate result. It reshapes nothing and
// recalculates no disposition, so an unrecognised shape is shown verbatim.
function rows(payload) {
  for (const value of [payload, payload?.capabilities, payload?.catalogue?.capabilities, payload?.result, payload?.items]) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

const scale = value => Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`;
const duration = value => typeof value === 'number' ? scale(value) : '';

// The elapsed wall time between consecutive streamed entries, read from the time
// each event already carries. The gap is event-to-event time, never the entry's
// own declared duration: a 0.06 ms entry inside a 5 s gap is exactly the signal.
// A missing time renders no gap; a clock that steps backwards renders its
// negative rather than hiding it. No kernel call and no new instrumentation.
const eventTime = event => {
  for (const value of [event?.observedAt, event?.completedAt, event?.startedAt]) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
};

export const formatGap = milliseconds => typeof milliseconds === 'number' && Number.isFinite(milliseconds)
  ? `(${milliseconds < 0 ? '-' : '+'}${scale(Math.abs(milliseconds))})` : '';

// The story stream's clock: one invocation's consecutive streamed entries, so a
// gap is measured only inside the same process stream. An entry without a time
// renders no gap and leaves the running clock where it was.
export function createStreamClock() {
  let first;
  let previous;
  let timed = 0;
  return {
    gap(event) {
      const time = eventTime(event);
      if (time === undefined) return '';
      const delta = previous === undefined ? undefined : time - previous;
      first ??= time;
      previous = time;
      timed += 1;
      return delta === undefined ? '' : formatGap(delta);
    },
    total() { return timed > 1 ? scale(previous - first) : ''; }
  };
}

// A streamed testimony item that carries its declared semantic address prints in
// the capability's own language: scenario, responsibility, mechanic. The address
// is estate data; only this presentation is the terminal's.
function semanticLine(when, event) {
  const mechanic = [event.mechanicId, event.mechanicPath].filter(Boolean).join(' ');
  const label = event.semanticRole === 'SCENARIO_OUTCOME' ? `scenario ${event.scenarioId}`
    : event.semanticRole === 'MECHANIC' ? mechanic || event.cellId
      : event.responsibilityKind === 'invoke-scenario' ? `scenario ${event.childScenarioId ?? event.responsibilityId}`
        : event.responsibilityId ?? event.cellId ?? event.edgeId;
  // An edge is the admission path into the addressed cell, not the cell itself.
  const isEdge = typeof event.edgeId === 'string';
  const admission = isEdge && typeof event.admissionDisposition === 'string' ? event.admissionDisposition : '';
  const mark = isEdge ? '↳' : event.semanticRole === 'MECHANIC' ? '·' : '✓';
  return [' ', mark, when, label, admission, duration(event.durationMilliseconds)].filter(Boolean).join(' ');
}

// A declared display entry owns the observation's bytes: the estate declares the
// status token and the text, the terminal renders the glyph and the framing.
// The entry's byte rules are the document emitter's, so a streamed entry and a
// printed entry read identically.
const entryLine = (when, entry) => [' ', glyphOf(entry.status), when, entryBody(entry)].filter(Boolean).join(' ');

// Telemetry is shown as the estate reported it. No field is derived, renamed or
// inferred here, and an event carrying none of these fields prints as itself.
// The gap is the stream clock's reading; it is appended to the human entry and
// never changes a machine (--json) entry.
export function renderObservation(event, json = false, gap = '') {
  if (json) return JSON.stringify({ observation: event });
  const when = typeof event?.observedAt === 'string' ? event.observedAt.slice(11, 23) : '';
  const entry = event?.display?.entry;
  let line;
  if (entry && typeof entry === 'object') line = entryLine(when, entry);
  else if (typeof event?.semanticRole === 'string') line = semanticLine(when, event);
  else {
    const subject = event?.phase ?? event?.scenarioId ?? event?.stepId ?? '';
    const sequence = Number.isInteger(event?.sequence) ? `#${event.sequence}` : '';
    const mechanical = [when, event?.observationType, subject, sequence, event?.status].filter(Boolean).join(' ');
    line = mechanical.length ? `  . ${mechanical}` : `  . ${pretty(event)}`;
  }
  const text = safe(line);
  return gap ? `${text} ${safe(gap)}` : text;
}

function capabilityLine(item) {
  if (typeof item === 'string') return item;
  const identity = [item.capabilityId, item.namespaceId ?? item.capabilityVersion, item.target].filter(Boolean).join('  ');
  const scenarios = Number.isInteger(item.scenarioCount) ? `  (${item.scenarioCount} scenario${item.scenarioCount === 1 ? '' : 's'})` : '';
  const circuit = item.circuitAvailable === true ? '  [circuit retained]' : '';
  const matched = Array.isArray(item.matchedFields) && item.matchedFields.length ? `  [matched: ${item.matchedFields.join(', ')}]` : '';
  // The declared intent, when the estate retains one. A capability without one
  // is listed by identity alone rather than with a manufactured summary.
  const intent = typeof item.userStory?.intent === 'string' && item.userStory.intent.length
    ? `\n      ${item.userStory.intent}` : '';
  return `${identity}${scenarios}${circuit}${matched}${intent}`;
}

// A path selection over the delivered outcome. The capability's interface declares
// what its CLI surface shows; the CLI applies it read-side, so the canonical result
// (evidence, executions, observations) is unchanged.
const select = (value, path) => String(path).split('.')
  .reduce((current, key) => (current === null || current === undefined ? current : current[key]), value);

const mark = disposition => disposition === 'completed' ? '✓' : '×';
const responsibilityLine = entry => `  ${mark(entry.disposition)} ${entry.responsibilityId ?? entry.childScenarioId}` +
  (entry.durationMilliseconds === undefined || entry.durationMilliseconds === null ? '' : `  ${duration(entry.durationMilliseconds)}`);

// The observed story: declared scenario faces, responsibilities in declared order
// with testimony timing, and any composed child scenarios. The estate supplied the
// structure; the terminal supplies the layout and the declared display projection.
function storyLines(story, payload, request) {
  const lines = [`Scenario ${story.scenario?.scenarioId ?? ''}`];
  if (story.scenario?.inputId) lines.push(`GIVEN ${story.scenario.inputId}` +
    (story.scenario.inputContractId ? `  (${story.scenario.inputContractId})` : ''));
  lines.push('WHEN');
  for (const entry of story.scenario?.responsibilities ?? []) lines.push(responsibilityLine(entry));
  lines.push('THEN');
  lines.push(`  ${mark('completed')} ${story.scenario?.outcomeId ?? story.scenario?.scenarioId ?? ''}` +
    (story.scenario?.outcomeContractId ? `  (${story.scenario.outcomeContractId})` : ''));
  for (const composed of story.composedScenarios ?? []) {
    lines.push('', `Scenario ${composed.scenarioId}${composed.parentScenarioId ? `  under ${composed.parentScenarioId}` : ''}`);
    for (const entry of composed.responsibilities ?? []) lines.push(responsibilityLine(entry));
  }
  if (request?.display && payload?.display) {
    const value = select(payload?.result, payload.display.select);
    lines.push('', payload.display.as === 'json' ? pretty(value) : safe(String(value ?? '')));
  }
  return lines.join('\n');
}

const ABSENT = '(not declared)';
const fieldValue = text => (typeof text === 'string' && text.trim().length ? text : ABSENT);
const parseJson = text => { try { return typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; } };

// The canonical story of one capability: the declared feature, user story,
// experience, scenarios, execution plan, ports and contracts. Every value is
// retained authority read by the declared `read-capability-meaning` capability;
// the terminal contributes labels and ordering only.
function meaningLines(payload, request) {
  const meaning = payload?.meaning ?? {};
  const graph = meaning.graphSource ?? {};
  const documents = new Map((meaning.documents ?? []).map(entry => [entry.entry_id, entry.document]));
  const authority = parseJson(documents.get('capability.authority.json')) ?? {};
  const feature = documents.get('capability.feature');
  const markdown = request?.format === 'markdown';
  const lines = [];
  const heading = title => markdown ? ['', `## ${title}`] : ['', title, '-'.repeat(title.length)];
  const field = (label, text, width = 10) => `${label.padEnd(width)}  ${fieldValue(text)}`;
  lines.push(`Capability  ${fieldValue(payload?.capabilityId)}`);
  lines.push(`Namespace   ${fieldValue(meaning.namespaceId)}`);
  lines.push(`Root        ${fieldValue(meaning.rootScenarioId)}`);
  // The declared root and the scenario actually read are distinct facts.
  if (typeof meaning.selectedScenarioId === 'string' && meaning.selectedScenarioId !== meaning.rootScenarioId)
    lines.push(`Selected    ${fieldValue(meaning.selectedScenarioId)}`);
  lines.push(`View        ${fieldValue(payload?.view)}`);
  lines.push(`Snapshot    ${fieldValue(payload?.evidence?.snapshotId)}`);
  if (feature) {
    lines.push(...heading('Canonical feature'));
    for (const line of String(feature).split('\n').map(item => item.trimEnd()).filter(line => line.trim().length))
      lines.push(`  ${line}`);
  }
  const userStory = authority.userStory;
  lines.push(...heading('User story'));
  if (userStory) {
    lines.push(field('Actor', userStory.actor, 8));
    lines.push(field('Intent', userStory.intent, 8));
    lines.push(field('Outcome', userStory.outcome, 8));
  } else lines.push(`The estate declares no user story for this capability. ${ABSENT}`);
  const experience = authority.experience;
  lines.push(...heading('Experience'));
  if (experience) {
    lines.push(field('Actor', experience.actor));
    lines.push(field('Experience', experience.experienceId));
    lines.push(field('Promise', experience.promise));
    lines.push(field('Conditions', (experience.observableConditions ?? []).map(condition => condition.conditionId).join(', ')));
  } else lines.push(`The estate declares no experience for this capability. ${ABSENT}`);
  const scenarios = graph.scenarios ?? [];
  lines.push(...heading(`Scenarios (${scenarios.length})`));
  for (const scenario of scenarios) {
    lines.push(`  ${scenario.scenarioId}`);
    lines.push(`    input    ${fieldValue(scenario.input?.inputId)}  (${fieldValue(scenario.input?.contract?.contractId)})`);
    lines.push(`    event    ${fieldValue(scenario.event?.eventId)}  (${fieldValue(scenario.event?.executionAuthorityId)})`);
    lines.push(`    outcome  ${fieldValue(scenario.outcome?.outcomeId)}  (${fieldValue(scenario.outcome?.contract?.contractId)})${scenario.outcome?.terminal ? '  [terminal]' : ''}`);
  }
  const selected = meaning.selectedScenario;
  if (selected && meaning.selectedScenarioId !== meaning.rootScenarioId) {
    lines.push(...heading(`Selected scenario (${meaning.selectedScenarioId})`));
    lines.push(`  owning capability  ${fieldValue(selected.capabilityId)}`);
    lines.push(`  input    ${fieldValue(selected.input?.inputId)}  (${fieldValue(selected.input?.contract?.contractId)})`);
    lines.push(`  event    ${fieldValue(selected.event?.eventId)}  (${fieldValue(selected.event?.executionAuthorityId)})`);
    lines.push(`  outcome  ${fieldValue(selected.outcome?.outcomeId)}  (${fieldValue(selected.outcome?.contract?.contractId)})${selected.outcome?.terminal ? '  [terminal]' : ''}`);
  }
  const authorities = graph.executionAuthorities ?? [];
  lines.push(...heading(`Execution plan (${authorities.length})`));
  for (const entry of authorities) {
    lines.push(`  ${entry.id}  owning ${fieldValue(entry.owningScenarioId)}`);
    for (const operation of entry.operations ?? [])
      lines.push(`    ${fieldValue(operation.kind)} -> ${fieldValue(operation.portId ?? operation.scenarioId)}`);
  }
  const ports = graph.interfaceAuthority?.portBindings ?? [];
  lines.push(...heading(`Ports (${ports.length})`));
  for (const port of ports) lines.push(`  ${port.portId}  ->  ${fieldValue(port.platformCapabilityId)}`);
  const contracts = Object.keys(graph.contractAuthorities?.contracts ?? {});
  lines.push(...heading(`Contracts (${contracts.length})`));
  for (const contractId of contracts) lines.push(`  ${contractId}`);
  return lines.join('\n');
}

// The hierarchical trace: the observed cells nested by their planned parent, in
// execution order. It is the same overlay the story joins; the trace reading
// keeps the mechanical depth the story collapses.
function traceLines(overlay) {
  const children = new Map();
  for (const cell of overlay?.cells ?? []) {
    const parent = cell.parentCellId ?? null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(cell);
  }
  const order = cell => cell.observed?.[0]?.logicalOrder ?? Number.MAX_SAFE_INTEGER;
  for (const list of children.values()) list.sort((left, right) => order(left) - order(right));
  const label = cell => {
    const address = cell.semanticAddress ?? {};
    if (address.semanticRole === 'SCENARIO_OUTCOME') return `scenario ${address.scenarioId}`;
    if (address.semanticRole === 'EXECUTION_RESPONSIBILITY') return address.responsibilityId ?? cell.cellId;
    return [address.mechanicId, address.mechanicPath].filter(Boolean).join(' ') || cell.cellId;
  };
  const lines = ['TRACE'];
  const walk = (parent, depth) => {
    for (const cell of children.get(parent) ?? []) {
      const observed = cell.observed?.[0];
      const mark = observed === undefined ? '—' : observed.disposition === 'completed' ? '✓' : '×';
      const timing = duration(observed?.durationMilliseconds);
      lines.push(`${'  '.repeat(depth)}${mark} ${label(cell)}${timing ? `  ${timing}` : ''}`);
      walk(cell.cellId, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

const GLYPHS = Object.freeze({ completed: '✓', failed: '×', unobserved: '—' });
const glyphOf = status => (Object.hasOwn(GLYPHS, status) ? GLYPHS[status] : '');
const entryBody = entry => `${safe(entry.text)}`
  + (entry.note ? `  (${safe(entry.note)})` : '')
  + (entry.admission ? ` ${safe(entry.admission)}` : '')
  + (entry.timing ? `  ${safe(entry.timing)}` : '');
const entryBytes = (entry, depth) => `${'  '.repeat(depth)}${glyphOf(entry.status) ? `${glyphOf(entry.status)} ` : ''}${entryBody(entry)}`;
const treeBytes = (entries, depth) => entries.flatMap(entry =>
  [entryBytes(entry, depth), ...treeBytes(entry.children ?? [], depth + 1)]);
const blocks = {
  heading: (block, as) => as === 'markdown' ? `## ${safe(block.text)}`
    : `${safe(block.text)}\n${'-'.repeat(safe(block.text).length)}`,
  field: block => `${safe(block.label)} ${safe(block.value)}${block.note ? `  (${safe(block.note)})` : ''}`,
  lane: block => [...(block.label ? [safe(block.label)] : []),
    ...(block.entries ?? []).map(entry => entryBytes(entry, 1))].join('\n'),
  tree: block => [...(block.label ? [safe(block.label)] : []), ...treeBytes(block.entries ?? [], 0)].join('\n'),
  list: block => (block.items ?? []).length
    ? block.items.map(entry => entryBytes(entry, 0)).join('\n') : safe(block.emptyText),
  display: block => block.as === 'json' ? pretty(block.value) : safe(block.value),
  line: block => safe(block.text),
  blank: () => '',
};

export function emitDocument(document, { as } = {}) {
  const lines = [];
  for (const block of document?.blocks ?? []) {
    if (block && Object.hasOwn(blocks, block.type)) lines.push(blocks[block.type](block, as));
  }
  return lines.join('\n');
}

// The agent lane frames two real governed receipts: the model provider's
// proposal and the capability lane's resolution/execution or absence. The frame
// prints the receipts as delivered; it derives no status and hides no refusal.
function agentLines(payload) {
  const agent = payload?.agentLane ?? {};
  const provider = [agent.provider, agent.model ? `(${agent.model})` : null].filter(Boolean).join(' ');
  const modelRows = [
    `provider    ${safe(provider)}`,
    `capability  ${safe(agent.capability)}  ${safe(agent.disposition)}`,
    agent.proposal ? `proposal    ${safe(agent.proposal.capability)}  input ${safe(agent.proposal.input)}` : 'proposal    none'
  ];
  const resolution = payload?.resolution;
  const resolutionRows = [resolution?.capability
    ? `capability  ${safe(resolution.capability)}  ${resolution.declared ? 'declared' : 'not declared'}`
    : 'capability  none'];
  const lines = [
    section('SIDEFX  agent execution', `objective   ${safe(payload?.objective)}`),
    section('MODEL PROVIDER (agent lane)', modelRows.join('\n')),
    section('SIDEFX (resolution lane)', resolutionRows.join('\n'))
  ];
  if (payload?.executionLane) {
    const execution = payload.executionLane;
    const rows = [`capability  ${safe(execution.capability)}`, `disposition ${safe(execution.disposition)}`];
    for (const [key, value] of Object.entries(execution.outcome ?? {})) {
      if (value === null || ['string', 'number'].includes(typeof value)) {
        const text = key === 'observedPrice' && execution.outcome?.currency !== undefined
          ? `${value} ${execution.outcome.currency}` : `${value}`;
        rows.push(`${key.padEnd(11)} ${safe(text)}`);
      }
    }
    if (execution.providerTestimony) rows.push(`provider    ${safe(execution.providerTestimony.providerId ?? execution.providerTestimony.bindingId)}`);
    lines.push(section('EXECUTION LANE', rows.join('\n')));
  } else if (payload?.refusal) {
    lines.push(section('NO EXECUTABLE PATH', `${safe(payload.refusal)}\nno provider reached; no effect`));
  }
  const receipt = payload?.receipt ?? {};
  lines.push(section('AGENCY RECEIPT', [
    `requested ${receipt.requested ?? 0}   executed ${receipt.executed ?? 0}   refused ${receipt.refused ?? 0}`,
    `providers reached ${receipt.executionProviderReached ?? 0} (execution), ${receipt.modelProviderReached ?? 0} (model)`,
    `wall ${duration(receipt.wallMilliseconds)}`,
    payload?.receiptNote ? `note ${safe(payload.receiptNote)}` : ''
  ].filter(Boolean).join('\n')));
  return lines.join('\n\n');
}

// --- Circuit view (CV-C1, transitional) -------------------------------------
// A generic emitter over the observe payload's planned-vs-observed overlay.
// Boxes are semantic cells — expression and selection sub-cells collapse into
// their enclosing cell; arrows are planned sequence; selection edges render
// both planned branches; the declared outcome payload closes the view as
// evidence. The presentation policy is NOT in this file: box geometry,
// wrapping, justification, status-row format, glyphs, label prefixes, the
// collapse limit, the connector characters and the diagram layout are read from
// the declared circuit-presentation.v1 policy and interpreted here. A missing
// policy is a delivery failure, never a built-in default. This emitter retires
// with render.mjs when the estate declares the bytes.

// The generic box frame and the non-connector branch markers. The policy
// carries the rail, arrow and fork connectors and the status glyphs; these
// frame characters are the emitter's frozen vocabulary (recorded in
// docs/implementation-plan-circuit-view.md, "UID audit and agent guard").
const CIRCUIT = Object.freeze({
  topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
  horizontal: '─', vertical: '│', teeUp: '┴', cross: '┼',
  right: '►', noEffect: '×'
});

// The declared policy is required wherever circuit geometry is interpreted.
// There is no fallback: the CLI fails before execution when the fetch fails.
const circuitPolicy = policy => {
  if (!policy || typeof policy !== 'object' || !policy.box || !policy.glyphs
    || !policy.labels?.prefixes || typeof policy.granularity?.detailCellLimit !== 'number'
    || !policy.connectors || !policy.layout
    || typeof policy.box.align !== 'string' || typeof policy.box.wrap !== 'string')
    throw new SidefxError('PRESENTATION_POLICY_REQUIRED',
      'The declared circuit presentation policy is required to render the circuit.', 4);
  return policy;
};

const circuitEntry = value => (Array.isArray(value?.observed) ? value.observed[0] : undefined);
const circuitAddress = cell => cell.semanticAddress ?? {};

const circuitLabel = cell => {
  const address = circuitAddress(cell);
  if ((cell.altitude === 'scenario' || address.semanticRole === 'SCENARIO_OUTCOME') && address.scenarioId)
    return address.scenarioId;
  if (address.responsibilityId) return address.responsibilityId;
  if (cell.altitude === 'provider' || cell.altitude === 'physical') return cell.altitude;
  const prefix = `cell:${cell.altitude}:`;
  const identity = String(cell.cellId ?? '');
  return identity.startsWith(prefix) ? identity.slice(prefix.length) : identity;
};

// A semantic cell is a scenario, responsibility or provider/physical cell; a
// cell whose id carries an expression or selection sub-cell belongs to its
// enclosing cell and never prints its own box.
const isCircuitCell = cell => ['scenario', 'mechanic', 'provider', 'physical'].includes(cell?.altitude)
  && typeof cell.cellId === 'string'
  && !cell.cellId.includes(':expression') && !cell.cellId.includes(':selection');

// Planned order: the execution's own logical order when observed, else the
// responsibility's declared ordinal, else the overlay's own insertion order.
const circuitOrder = cell => {
  const entry = circuitEntry(cell);
  if (entry && Number.isFinite(entry.logicalOrder)) return entry.logicalOrder;
  const ordinal = circuitAddress(cell).responsibilityOrdinal;
  return Number.isInteger(ordinal) ? ordinal : Number.MAX_SAFE_INTEGER;
};

const shiftLines = (lines, columns) => lines.map(line => `${' '.repeat(columns)}${line}`);

// Every content line is centered within the declared content columns; the box
// bars are the declared column count, so the text area is two columns narrower.
const padCenter = (text, width) => {
  const room = Math.max(0, width - text.length);
  const left = Math.floor(room / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(room - left)}`;
};
const padRight = (text, width) => `${text}${' '.repeat(Math.max(0, width - text.length))}`;

// The declared wrap rule (hyphen-preferred): words break at spaces inside the
// limit; a word wider than the limit breaks after its last hyphen inside the
// limit; only then does it hard-break.
const breakWord = (word, limit) => {
  const pieces = [];
  let rest = word;
  while (rest.length > limit) {
    const hyphen = rest.lastIndexOf('-', limit - 1);
    pieces.push(rest.slice(0, hyphen > 0 ? hyphen + 1 : limit));
    rest = rest.slice(hyphen > 0 ? hyphen + 1 : limit);
  }
  pieces.push(rest);
  return pieces;
};

const wrapText = (text, limit) => {
  const lines = [];
  for (const word of String(text).split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= limit) {
      lines[lines.length - 1] = `${last} ${word}`;
      continue;
    }
    if (word.length <= limit) { lines.push(word); continue; }
    lines.push(...breakWord(word, limit));
  }
  return lines.length ? lines.map(line => line.replace(/\s+$/, '')) : [''];
};

// The altitude prefix is declared policy; an altitude without one is a declared
// gap, not a place for the emitter to invent a name.
function circuitTitle(cell, policy) {
  const label = circuitLabel(cell);
  const prefix = policy.labels?.prefixes?.[cell.altitude];
  if (typeof prefix !== 'string' || prefix.length === 0)
    throw new SidefxError('PRESENTATION_POLICY_INCOMPLETE',
      `The declared circuit presentation policy carries no label prefix for altitude ${cell.altitude}.`, 4);
  return label.toLowerCase() === cell.altitude ? prefix : `${prefix}  ${label}`;
}

// The status token is the testimony's declared classification: success/failure
// when the testimony carries it, otherwise the estate's declared display-entry
// status (completed/failed are its declared tokens), otherwise unobserved. The
// mechanical disposition is never consulted: it is not classification, and an
// unlit cell is never rendered as a failure.
const circuitStatusToken = (outcomeClassification, entryStatus) => {
  if (outcomeClassification === 'success' || outcomeClassification === 'failure') return outcomeClassification;
  if (entryStatus === 'completed') return 'success';
  if (entryStatus === 'failed') return 'failure';
  return 'unobserved';
};
const circuitEntryToken = entry => circuitStatusToken(entry?.outcomeClassification, entry?.display?.entry?.status);

function circuitStatusLine(cell, policy) {
  const entry = circuitEntry(cell);
  const timing = duration(entry?.durationMilliseconds);
  const glyph = policy.glyphs?.[circuitEntryToken(entry)] ?? '';
  return timing ? `${glyph} ${timing}` : glyph;
}

function circuitContentLines(cell, context) {
  const policy = context.policy;
  // The declared wrap rule is interpreted; an undeclared rule is a policy gap,
  // not a place for the emitter to guess.
  if (policy.box.wrap !== 'hyphen-preferred')
    throw new SidefxError('PRESENTATION_POLICY_INCOMPLETE',
      `The declared circuit presentation wrap rule ${policy.box.wrap} is not interpreted.`, 4);
  const limit = Math.max(1, policy.box.maxColumns - 2);
  const count = context.detailed ? 0 : context.counts.get(cell.cellId) ?? 0;
  const suffix = count ? `  (${count} cell${count === 1 ? '' : 's'})` : '';
  const lines = wrapText(`${circuitTitle(cell, policy)}${suffix}`, limit);
  const status = policy.statusRow?.enabled === false ? null : circuitStatusLine(cell, policy);
  if (status !== null) lines.push(status);
  // The declared minimum content rows (label row(s) plus one status row; no
  // blank filler). The declared rows already meet the declared floor; filler is
  // emitted only if a future declaration raises the floor.
  if (lines.length < policy.box.minRows) {
    const blanks = policy.box.minRows - lines.length;
    const before = Math.floor(blanks / 2);
    lines.unshift(...Array.from({ length: before }, () => ''));
    lines.splice(status !== null ? lines.length - 1 : lines.length, 0, ...Array.from({ length: blanks - before }, () => ''));
  }
  return lines;
}

// The box columns are the declared policy's: the text wraps inside the maximum
// (minus the two padding columns) and the bars never fall below the minimum.
const circuitColumns = (lines, policy) => Math.min(policy.box.maxColumns,
  Math.max(policy.box.minColumns, Math.max(0, ...lines.map(line => line.length)) + 2));

function circuitBox(lines, policy) {
  // The declared justification is interpreted; an undeclared one is a policy
  // gap, not a place for the emitter to guess.
  if (policy.box.align !== 'center')
    throw new SidefxError('PRESENTATION_POLICY_INCOMPLETE',
      `The declared circuit presentation alignment ${policy.box.align} is not interpreted.`, 4);
  const columns = circuitColumns(lines, policy);
  const inner = Math.max(1, columns - 2);
  return [
    `${CIRCUIT.topLeft}${CIRCUIT.horizontal.repeat(columns)}${CIRCUIT.topRight}`,
    ...lines.map(line => `${CIRCUIT.vertical} ${padCenter(line, inner)} ${CIRCUIT.vertical}`),
    `${CIRCUIT.bottomLeft}${CIRCUIT.horizontal.repeat(columns)}${CIRCUIT.bottomRight}`
  ];
}

// One cell's box and its rendered width (bars included), both policy-sized.
const circuitBlock = (cell, context) => {
  const lines = circuitContentLines(cell, context);
  return { box: circuitBox(lines, context.policy), width: circuitColumns(lines, context.policy) + 2 };
};

// The detailed tree: every semantic cell under its planned parent; the summary
// tree: only scenarios, with their responsibilities summarized by count.
function circuitChildren(cells) {
  const children = new Map();
  const add = (parent, child) => {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  };
  for (const cell of cells) if (cell.parentCellId) add(cell.parentCellId, cell);
  const hosts = cells.filter(cell => circuitAddress(cell).responsibilityKind === 'invoke-scenario');
  for (const scenario of cells) {
    if (scenario.altitude !== 'scenario') continue;
    const parentScenarioId = circuitAddress(scenario).parentScenarioId;
    if (!parentScenarioId) continue;
    const host = hosts.find(cell => circuitAddress(cell).scenarioId === parentScenarioId
      && circuitAddress(cell).responsibilityId === circuitAddress(scenario).scenarioId);
    if (host) add(host.cellId, scenario);
  }
  for (const list of children.values()) list.sort((left, right) => circuitOrder(left) - circuitOrder(right));
  return children;
}

function circuitScenarioChildren(cells) {
  const children = new Map();
  const scenarios = new Map(cells.filter(cell => cell.altitude === 'scenario')
    .map(cell => [circuitAddress(cell).scenarioId, cell]));
  for (const cell of cells) {
    if (cell.altitude !== 'scenario') continue;
    const parent = scenarios.get(circuitAddress(cell).parentScenarioId);
    if (!parent) continue;
    if (!children.has(parent.cellId)) children.set(parent.cellId, []);
    children.get(parent.cellId).push(cell);
  }
  for (const list of children.values()) list.sort((left, right) => circuitOrder(left) - circuitOrder(right));
  return children;
}

// Selection edges are the only branches: every other edge is the sequence the
// detailed tree already walks. A variant is selected only when its own observed
// admission says admitted; both planned branches always render.
function circuitRoutes(edges, cellsById) {
  const routes = new Map();
  for (const edge of edges ?? []) {
    if (edge?.kind !== 'selection') continue;
    const source = cellsById.get(edge.planned?.from?.cellId);
    const target = cellsById.get(edge.planned?.to?.cellId);
    if (!source || !target) continue;
    if (!routes.has(source.cellId)) routes.set(source.cellId, []);
    const entry = circuitEntry(edge);
    routes.get(source.cellId).push({
      variant: edge.planned?.selectsVariant ?? edge.edgeId ?? 'selection',
      admitted: entry?.admissionDisposition === 'admitted',
      order: entry && Number.isFinite(entry.logicalOrder) ? entry.logicalOrder : Number.MAX_SAFE_INTEGER,
      target
    });
  }
  return routes;
}

// A scenario's child count sums the semantic cells whose nearest enclosing
// scenario is that scenario; a child scenario's own cells count under it.
function circuitCounts(cells) {
  const byId = new Map(cells.map(cell => [cell.cellId, cell]));
  const counts = new Map();
  for (const cell of cells) {
    if (cell.altitude === 'scenario') continue;
    let parent = cell.parentCellId;
    while (parent) {
      const enclosing = byId.get(parent);
      if (!enclosing) break;
      if (enclosing.altitude === 'scenario') {
        counts.set(enclosing.cellId, (counts.get(enclosing.cellId) ?? 0) + 1);
        break;
      }
      parent = enclosing.parentCellId;
    }
  }
  return counts;
}

const circuitRow = (positions, glyph, length) => {
  const row = Array.from({ length }, () => ' ');
  for (const position of positions) row[position] = glyph;
  return row.join('').replace(/\s+$/, '');
};

const circuitWidth = content => Math.max(30, content.length + 2);
const insertAt = (line, position, glyph) => `${line.slice(0, position)}${glyph}${line.slice(position)}`;

// The box of one cell and everything the plan puts under it. Provider and
// physical cells indent one step by altitude; every other cell keeps the
// chain's column. Routes render both planned branches, and the admitted
// target's subtree continues beneath its own column. When a route leaves a
// cell that also has children, a rail carries the source's line down the
// left of the children and back into the branch.
function circuitNode(cell, context, columns = 0) {
  const lines = shiftLines(circuitBlock(cell, context).box, columns);
  if (context.visited.has(cell.cellId)) return lines;
  context.visited.add(cell.cellId);
  return [...lines, ...circuitBody(cell, context, columns)];
}

function circuitBody(cell, context, columns) {
  const policy = context.policy;
  const tree = context.detailed ? context.children : context.scenarioChildren;
  const entries = [];
  for (const child of tree.get(cell.cellId) ?? []) {
    if (context.visited.has(child.cellId)) continue;
    entries.push({ order: circuitOrder(child), child });
  }
  const group = context.routes.get(cell.cellId);
  if (group) entries.push({
    order: group.reduce((order, variant) => Math.min(order, variant.order), Number.MAX_SAFE_INTEGER), group
  });
  entries.sort((left, right) => left.order - right.order);
  const rail = Boolean(group) && entries.some(entry => entry.child);
  const lines = [];
  for (const entry of entries) {
    if (entry.child) {
      const depth = entry.child.altitude === 'provider' || entry.child.altitude === 'physical' ? 2 : 0;
      const childColumns = columns + (rail ? 1 : 0) + depth;
      const center = childColumns + Math.floor(circuitBlock(entry.child, context).width / 2);
      const block = [`${' '.repeat(center)}${policy.connectors.rail}`, `${' '.repeat(center)}${policy.connectors.arrow}`,
        ...circuitNode(entry.child, context, childColumns)];
      for (const line of block) lines.push(rail ? insertAt(line, columns, policy.connectors.rail) : line);
    } else {
      const branch = circuitBranch(entry.group, context, columns, circuitBlock(cell, context).width, rail);
      lines.push(...branch.lines);
      if (branch.selected) lines.push(...circuitBody(branch.selected.target, context, branch.selected.columns));
    }
  }
  return lines;
}

function circuitBranch(group, context, columns, sourceWidth, rail) {
  const policy = context.policy;
  const { rail: railGlyph, arrow, fork } = policy.connectors;
  const gap = 5;
  const variants = group.map(variant => {
    const label = variant.admitted
      ? `${CIRCUIT.right} ${variant.variant}`
      : `${CIRCUIT.noEffect} ${variant.variant}  NO EFFECT`;
    const block = circuitBlock(variant.target, context);
    const fresh = !context.visited.has(variant.target.cellId);
    if (fresh) context.visited.add(variant.target.cellId);
    return { variant, label, box: block.box, fresh, width: Math.max(...block.box.map(line => line.length), label.length) };
  });
  const offsets = [];
  let cursor = 0;
  for (const entry of variants) { offsets.push(cursor); cursor += entry.width + gap; }
  const total = cursor - gap;
  const centers = variants.map((entry, index) => offsets[index] + Math.floor(entry.width / 2));
  const source = columns + Math.floor(sourceWidth / 2);
  const margin = Math.max(0, source - Math.floor(total / 2));
  const shifted = centers.map(center => center + margin);
  const left = Math.min(rail ? columns : source, shifted[0]);
  const right = Math.max(rail ? columns : source, shifted[shifted.length - 1]);
  const fan = Array.from({ length: right + 1 }, () => ' ');
  for (let column = left + 1; column < right; column += 1) fan[column] = CIRCUIT.horizontal;
  fan[left] = CIRCUIT.topLeft;
  fan[right] = CIRCUIT.topRight;
  for (const center of shifted) if (center > left && center < right) fan[center] = fork;
  if (rail) {
    fan[columns] = columns === left ? CIRCUIT.bottomLeft : columns === right ? CIRCUIT.bottomRight : CIRCUIT.teeUp;
    if (shifted.includes(columns)) fan[columns] = CIRCUIT.cross;
  } else if (source === left) {
    fan[left] = fork;
  } else if (source === right) {
    fan[right] = fork;
  } else if (source > left && source < right) {
    fan[source] = fan[source] === CIRCUIT.horizontal ? CIRCUIT.teeUp : CIRCUIT.cross;
  }
  const labelRow = Array.from({ length: right + 1 }, () => ' ');
  variants.forEach((entry, index) => {
    const start = Math.max(0, shifted[index] - Math.floor(entry.label.length / 2));
    for (let position = 0; position < entry.label.length; position += 1) labelRow[start + position] = entry.label[position];
  });
  const lines = [];
  if (!rail) lines.push(`${' '.repeat(source)}${railGlyph}`);
  const labelLine = labelRow.join('').replace(/\s+$/, '');
  lines.push(fan.join('').replace(/\s+$/, ''), circuitRow(shifted, railGlyph, right + 1));
  if (policy.connectors.labelAbove !== false) lines.push(labelLine);
  lines.push(circuitRow(shifted, arrow, right + 1));
  const height = Math.max(...variants.map(entry => entry.box.length));
  for (let index = 0; index < height; index += 1) {
    lines.push(`${' '.repeat(margin)}${variants.map(entry => padRight(entry.box[index] ?? '', entry.width)).join(' '.repeat(gap))}`.replace(/\s+$/, ''));
  }
  if (policy.connectors.labelAbove === false) lines.push(labelLine);
  const selectedIndex = group.findIndex(variant => variant.admitted);
  return {
    lines,
    selected: selectedIndex === -1 || !variants[selectedIndex].fresh ? null
      : { target: group[selectedIndex].target, columns: margin + offsets[selectedIndex] }
  };
}

// The closing frame: only what testimony alone cannot know. Every observed
// component already streamed as a box; what remains is the planned selection
// topology — both branches, the admitted one lit, the unobserved one marked NO
// EFFECT — and the outcome payload.
function circuitTextBranch(variants, sourceCenter, policy) {
  const { rail, arrow, fork } = policy.connectors;
  const gap = 6;
  const widths = variants.map(variant => Math.max(variant.marker.length, variant.target.length));
  const offsets = [];
  let cursor = 0;
  for (const width of widths) { offsets.push(cursor); cursor += width + gap; }
  const centers = widths.map((width, index) => offsets[index] + Math.floor(width / 2));
  const left = Math.min(sourceCenter, centers[0]);
  const right = Math.max(sourceCenter, centers[centers.length - 1]);
  const fan = Array.from({ length: right + 1 }, () => ' ');
  for (let column = left + 1; column < right; column += 1) fan[column] = CIRCUIT.horizontal;
  fan[left] = CIRCUIT.topLeft;
  fan[right] = CIRCUIT.topRight;
  for (const center of centers) if (center > left && center < right) fan[center] = fork;
  for (const center of centers) if (center === left || center === right) fan[center] = fork;
  if (sourceCenter > left && sourceCenter < right) fan[sourceCenter] = CIRCUIT.teeUp;
  else if (sourceCenter === left && fan[left] === CIRCUIT.topLeft) fan[left] = CIRCUIT.bottomLeft;
  else if (sourceCenter === right && fan[right] === CIRCUIT.topRight) fan[right] = CIRCUIT.bottomRight;
  const markerRow = Array.from({ length: right + 1 }, () => ' ');
  const targetRow = Array.from({ length: right + 1 }, () => ' ');
  variants.forEach((variant, index) => {
    const start = Math.max(0, centers[index] - Math.floor(variant.marker.length / 2));
    for (let position = 0; position < variant.marker.length; position += 1) markerRow[start + position] = variant.marker[position];
    const targetStart = Math.max(0, centers[index] - Math.floor(variant.target.length / 2));
    for (let position = 0; position < variant.target.length; position += 1) targetRow[targetStart + position] = variant.target[position];
  });
  return [fan.join('').replace(/\s+$/, ''), circuitRow(centers, rail, right + 1),
    markerRow.join('').replace(/\s+$/, ''), targetRow.join('').replace(/\s+$/, '')];
}

function circuitClosing(overlay, payload, policy) {
  const cells = (overlay?.cells ?? []).filter(isCircuitCell);
  const cellsById = new Map(cells.map(cell => [cell.cellId, cell]));
  const routes = circuitRoutes(overlay?.edges ?? [], cellsById);
  const lines = [];
  for (const [sourceId, group] of routes) {
    const title = `BRANCH  ${circuitLabel(cellsById.get(sourceId))}`;
    const variants = group.map(variant => ({
      marker: variant.admitted
        ? `${CIRCUIT.right} ${variant.variant}`
        : `${CIRCUIT.noEffect} ${variant.variant}  NO EFFECT`,
      target: circuitLabel(variant.target)
    }));
    lines.push(title, ...circuitTextBranch(variants, 8 + Math.floor((title.length - 8) / 2), policy));
  }
  const evidence = payload?.result?.outcome?.payload;
  if (evidence !== undefined) lines.push('', `EVIDENCE  ${JSON.stringify(evidence)}`);
  return lines.join('\n');
}

// A streamed semantic component from one observation event. Expression and
// selection sub-cells belong to their enclosing cell and never print. The
// status is the testimony's declared classification (the mechanical disposition
// is never consulted), and the duration is the event's own field, verbatim.
const circuitStreamCell = event => {
  if (typeof event?.cellId !== 'string' || !['scenario', 'mechanic', 'provider', 'physical'].includes(event.cellAltitude)
    || event.cellId.includes(':expression') || event.cellId.includes(':selection')) return null;
  const token = circuitStatusToken(event.outcomeClassification, event.display?.entry?.status);
  return { cellId: event.cellId, altitude: event.cellAltitude, semanticAddress: event,
    observed: [{ outcomeClassification: token, durationMilliseconds: event.durationMilliseconds }] };
};

// The streamed circuit: one box per semantic component as testimony arrives,
// with the connector centered under the arriving box. The stream's order is the
// execution's own; the closing frame carries the plan-only knowledge. The
// per-invocation state belongs to the caller, because the box prints as the
// event arrives rather than being collected into a view. The declared layout's
// stable indent keeps each altitude's column fixed while boxes arrive.
export function renderCircuitObservation(event, state = {}) {
  const policy = circuitPolicy(state.policy);
  const cell = circuitStreamCell(event);
  if (cell === null) return '';
  const block = circuitBlock(cell, { policy, detailed: true });
  const depth = cell.altitude === 'provider' || cell.altitude === 'physical' ? 2 : 0;
  const indent = policy.layout?.stableIndent === false ? 0 : depth;
  const center = indent + Math.floor(block.width / 2);
  const lines = [];
  if (state.previous) lines.push(`${' '.repeat(center)}${policy.connectors.rail}`, `${' '.repeat(center)}${policy.connectors.arrow}`);
  lines.push(...shiftLines(block.box, indent));
  state.previous = true;
  return lines.join('\n');
}

export function circuitView(overlay, payload, request) {
  const policy = circuitPolicy(request?.presentation);
  if (request?.streamedCircuit === true) return circuitClosing(overlay, payload, policy);
  const cells = (overlay?.cells ?? []).filter(isCircuitCell);
  if (!cells.length) return pretty(payload ?? overlay ?? {});
  const counts = circuitCounts(cells);
  const detailed = cells.length <= policy.granularity.detailCellLimit;
  const routes = circuitRoutes(overlay?.edges ?? [], new Map(cells.map(cell => [cell.cellId, cell])));
  const context = { policy, detailed, counts, routes, children: circuitChildren(cells), scenarioChildren: circuitScenarioChildren(cells), visited: new Set() };
  const targets = new Set();
  for (const group of routes.values()) for (const variant of group) targets.add(variant.target.cellId);
  const roots = cells.filter(cell => cell.altitude === 'scenario'
    && !circuitAddress(cell).parentScenarioId && !targets.has(cell.cellId))
    .sort((left, right) => circuitOrder(left) - circuitOrder(right));
  const lines = [`CIRCUIT  ${payload?.capabilityId ?? overlay?.graphId ?? ''}`.trimEnd()];
  for (const root of roots) lines.push(...circuitNode(root, context));
  for (const cell of cells) if (cell.altitude === 'scenario' && !context.visited.has(cell.cellId)) lines.push(...circuitNode(cell, context));
  const evidence = payload?.result?.outcome?.payload;
  if (evidence !== undefined) lines.push('', `EVIDENCE  ${JSON.stringify(evidence)}`);
  return lines.join('\n');
}

function format(operation, payload, request) {
  const declared = payload?.display?.document;
  if (operation === 'agent-invoke') return agentLines(payload);
  // A streamed circuit always closes with its own frame, overlay or not: the
  // stream already owns the boxes, so a closing story would be a second reading.
  if (operation === 'observe' && request?.format === 'circuit'
    && (payload?.overlay || request?.streamedCircuit === true))
    return circuitView(payload?.overlay, payload, request);
  if (operation === 'observe' && payload?.story) {
    // The declared document owns the reading selection: when it is present the
    // terminal emits its bytes and never composes a second reading of its own.
    if (declared) return emitDocument(declared, { as: payload.display.as });
    const story = storyLines(payload.story, payload, request);
    return request?.trace && payload.overlay ? `${story}\n\n${traceLines(payload.overlay)}` : story;
  }
  if (declared) return emitDocument(declared, { as: payload.display.as });
  if (operation === 'reveal' && payload?.meaning) return meaningLines(payload, request);
  if (request?.display && payload?.display) {
    const value = select(payload?.result, payload.display.select);
    return payload.display.as === 'json' ? pretty(value) : safe(String(value ?? ''));
  }
  // A projection report names where the mechanical bodies landed and what each
  // target's plan covers. The digests are the estate's; nothing is recomputed.
  if (operation === 'project' && Array.isArray(payload?.plans)) {
    const lines = [`Projected ${fieldValue(payload.capabilityId)} -> ${fieldValue(payload.outDir)}`];
    for (const plan of payload.plans) {
      const closure = plan.mechanicsComplete === true ? '' : '  [mechanics incomplete]';
      lines.push(`  ${String(plan.target).padEnd(7)}  canonical ${fieldValue(plan.canonicalGraphDigest)}`
        + `  bindings ${plan.providerBindings}/${plan.requiredSlots}${closure}`);
    }
    lines.push(`${fieldValue(payload.conformance)}; ${payload.documents ?? 0} declared document(s), `
      + `${payload.files ?? 0} file(s)${payload.fullMechanics === true ? '; full mechanics required' : ''}`);
    return lines.join('\n');
  }
  // A narrative is human language the estate composed from its own retained
  // authority. It is printed exactly as delivered.
  if (Array.isArray(payload?.narrative) && payload.narrative.every(line => typeof line === 'string')) {
    return payload.narrative.join('\n');
  }
  const items = rows(payload);
  if (['list', 'find', 'catalogue'].includes(operation) && items) {
    return section(`Capabilities (${items.length})`, list(items, capabilityLine));
  }
  return pretty(payload);
}

export function render(request, result, mapping) {
  const spec = semanticCommand(request.object, request.verb, mapping);
  const payload = result?.payload ?? result;
  if (!spec?.offered) return safe(pretty(payload));
  return safe(format(spec.wraps.operation, payload, request));
}
