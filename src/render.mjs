import { semanticCommand } from './commands.mjs';

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
// evidence. Only the layout is the terminal's: every status and duration is the
// overlay's own entry, and an unobserved cell renders unobserved, never failed.
// This emitter retires with render.mjs when the estate declares the bytes.

const CIRCUIT = Object.freeze({
  topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
  horizontal: '─', vertical: '│', teeDown: '┬', teeUp: '┴', cross: '┼',
  down: '▼', right: '►', noEffect: '×'
});

const CIRCUIT_GLYPHS = Object.freeze({ completed: '✓', failed: '×', unobserved: '–' });
// Above this many semantic cells the view collapses to scenario-level boxes with
// child counts instead of printing every responsibility cell. The agent lane's
// 60 semantic cells collapse; the equity capability's 19 stay detailed.
const CIRCUIT_DETAIL_LIMIT = 30;

const circuitEntry = value => (Array.isArray(value?.observed) ? value.observed[0] : undefined);
const circuitStatus = value => {
  const entry = circuitEntry(value);
  return entry === undefined ? 'unobserved' : entry.disposition === 'completed' ? 'completed' : 'failed';
};
const circuitGlyph = status => CIRCUIT_GLYPHS[status] ?? '';
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

const pad = (text, width) => `${text}${' '.repeat(Math.max(0, width - text.length))}`;
const shiftLines = (lines, columns) => lines.map(line => `${' '.repeat(columns)}${line}`);

function circuitBox(content, width) {
  return [
    `${CIRCUIT.topLeft}${CIRCUIT.horizontal.repeat(width)}${CIRCUIT.topRight}`,
    `${CIRCUIT.vertical} ${pad(content, width - 2)} ${CIRCUIT.vertical}`,
    `${CIRCUIT.bottomLeft}${CIRCUIT.horizontal.repeat(width)}${CIRCUIT.bottomRight}`
  ];
}

function circuitContent(cell, context) {
  const label = circuitLabel(cell);
  const title = label.toLowerCase() === cell.altitude ? cell.altitude.toUpperCase() : `${cell.altitude.toUpperCase()}  ${label}`;
  const timing = duration(circuitEntry(cell)?.durationMilliseconds);
  const count = context.detailed ? 0 : context.counts.get(cell.cellId) ?? 0;
  const children = count ? `  (${count} cell${count === 1 ? '' : 's'})` : '';
  return `${title}  ${circuitGlyph(circuitStatus(cell))}${timing ? `  ${timing}` : ''}${children}`;
}

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
  const content = circuitContent(cell, context);
  const lines = shiftLines(circuitBox(content, circuitWidth(content)), columns);
  if (context.visited.has(cell.cellId)) return lines;
  context.visited.add(cell.cellId);
  return [...lines, ...circuitBody(cell, context, columns)];
}

function circuitBody(cell, context, columns) {
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
      const center = childColumns + Math.floor(circuitWidth(circuitContent(entry.child, context)) / 2);
      const block = [`${' '.repeat(center)}${CIRCUIT.vertical}`, `${' '.repeat(center)}${CIRCUIT.down}`,
        ...circuitNode(entry.child, context, childColumns)];
      for (const line of block) lines.push(rail ? insertAt(line, columns, CIRCUIT.vertical) : line);
    } else {
      const branch = circuitBranch(entry.group, context, columns, circuitWidth(circuitContent(cell, context)), rail);
      lines.push(...branch.lines);
      if (branch.selected) lines.push(...circuitBody(branch.selected.target, context, branch.selected.columns));
    }
  }
  return lines;
}

function circuitBranch(group, context, columns, sourceWidth, rail) {
  const gap = 5;
  const variants = group.map(variant => {
    const label = variant.admitted
      ? `${CIRCUIT.right} ${variant.variant}`
      : `${CIRCUIT.noEffect} ${variant.variant}  NO EFFECT`;
    const content = circuitContent(variant.target, context);
    const box = circuitBox(content, circuitWidth(content));
    const fresh = !context.visited.has(variant.target.cellId);
    if (fresh) context.visited.add(variant.target.cellId);
    return { variant, label, box, fresh, width: Math.max(...box.map(line => line.length), label.length) };
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
  for (const center of shifted) if (center > left && center < right) fan[center] = CIRCUIT.teeDown;
  if (rail) {
    fan[columns] = columns === left ? CIRCUIT.bottomLeft : columns === right ? CIRCUIT.bottomRight : CIRCUIT.teeUp;
    if (shifted.includes(columns)) fan[columns] = CIRCUIT.cross;
  } else if (source === left) {
    fan[left] = CIRCUIT.teeDown;
  } else if (source === right) {
    fan[right] = CIRCUIT.teeDown;
  } else if (source > left && source < right) {
    fan[source] = fan[source] === CIRCUIT.horizontal ? CIRCUIT.teeUp : CIRCUIT.cross;
  }
  const labelRow = Array.from({ length: right + 1 }, () => ' ');
  variants.forEach((entry, index) => {
    const start = Math.max(0, shifted[index] - Math.floor(entry.label.length / 2));
    for (let position = 0; position < entry.label.length; position += 1) labelRow[start + position] = entry.label[position];
  });
  const lines = [];
  if (!rail) lines.push(`${' '.repeat(source)}${CIRCUIT.vertical}`);
  lines.push(fan.join('').replace(/\s+$/, ''),
    circuitRow(shifted, CIRCUIT.vertical, right + 1),
    labelRow.join('').replace(/\s+$/, ''),
    circuitRow(shifted, CIRCUIT.down, right + 1));
  const height = Math.max(...variants.map(entry => entry.box.length));
  for (let index = 0; index < height; index += 1) {
    lines.push(`${' '.repeat(margin)}${variants.map(entry => pad(entry.box[index] ?? '', entry.width)).join(' '.repeat(gap))}`.replace(/\s+$/, ''));
  }
  const selectedIndex = group.findIndex(variant => variant.admitted);
  return {
    lines,
    selected: selectedIndex === -1 || !variants[selectedIndex].fresh ? null
      : { target: group[selectedIndex].target, columns: margin + offsets[selectedIndex] }
  };
}

export function circuitView(overlay, payload, request) {
  const cells = (overlay?.cells ?? []).filter(isCircuitCell);
  if (!cells.length) return pretty(payload ?? overlay ?? {});
  const counts = circuitCounts(cells);
  const detailed = cells.length <= CIRCUIT_DETAIL_LIMIT;
  const routes = circuitRoutes(overlay?.edges ?? [], new Map(cells.map(cell => [cell.cellId, cell])));
  const context = { detailed, counts, routes, children: circuitChildren(cells), scenarioChildren: circuitScenarioChildren(cells), visited: new Set() };
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
  if (operation === 'observe' && request?.format === 'circuit' && payload?.overlay)
    return circuitView(payload.overlay, payload, request);
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
