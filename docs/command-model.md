# SideFX command model

## Entity Neutrality Law

No entity instance, business domain, provider, or implementation technology may
introduce special interface syntax. Entity-specific meaning and behavior resolve
through canonical SideFX authority.

The law covers capabilities, scenarios, inputs, events, outcomes, providers,
capsules, executions, estates, profiles, evidence, and future entity types.
Provider Neutrality is its provider-specific case. The invariant applies to CLI,
SDK, API, MCP and UI projections of the architecture.

| Concern | Authority |
| --- | --- |
| Supported operations and relationships | Entity type and its shared contracts |
| Selected instance | Canonical identity, including its containing authority where required |
| Meaning, input/event/outcome contracts and constraints | Exact selected canonical authority |
| Physical execution | Eligible provider selected against required profiles and evidence |
| Display and transport | Interface projection preserving identity, scope and testimony |

Neutrality preserves type distinctions. A capability and an execution may have
the same textual identifier without becoming interchangeable. Entity-specific
contracts still govern valid input and outcomes; neutrality does not mean every
object supports every operation or that arbitrary entity types can execute.

`sfx` speaks the SideFX capability model. Providers supply data and mechanics
behind that model. The canonical shape is:

```text
sfx <object> <operation> [identity]
```

The vocabulary is `provider`, `capability`, `scenario`, `capsule`, `execution`,
`estate`, `profile`, and `evidence`. Supported pairs are explicit; the vocabulary
does not imply that every object supports every operation.

Inputs, events and outcomes are presently represented within capsule-owned
scenario views and contracts. Their identities and relationships are retained as
authority data. They do not yet have standalone command families. Unsupported
entity/operation pairs fail explicitly instead of inventing local mechanics.

## Provider Neutrality Law

As a consequence of Entity Neutrality, no provider, vendor, ecosystem, transport,
language or implementation technology adds commands or flags to expose its own
mechanics. Provider-specific values remain canonical data/configuration.

These use the same parser, descriptor contract and rendering:

```text
sfx provider inspect rapidapi/weatherapi
sfx provider inspect cncf/opentelemetry
sfx provider inspect internal/customer-records
sfx provider inspect facility/drone-17
```

Provider IDs currently use `namespace/name`. Neither component selects code in
the parser. For local inspection, supply a descriptor catalog or register a local
reference. For a managed observation, supply an exact observation capability and
its canonical input through `--via` or an object-scoped route.

## Supported operations and current scope

| Object | Operations | Current implementation boundary |
| --- | --- | --- |
| `provider` | `list`, `search [query]`, `inspect ID`, `compare ID ID`, `add ID`, `remove ID` | Catalog testimony and local references. Search/inspect/compare can delegate. List includes descriptors and references separately. |
| `provider` | `discover SOURCE`, `evaluate ID`, `admit ID`, `assimilate ID`, `configure ID`, `publish ID` | Always delegated; an exact capability binding and canonical input are required. |
| `capability` | `list`, `search [query]`, `find QUERY`, `inspect ID`, `providers ID`, `scenarios ID`, `reveal ID`, `resolve ID`, `invoke ID`, `evaluate ID`, `compare ID ID` | Existing estate discovery, representations, execution and fixture proof. Resolve/evaluate/compare can delegate. |
| `capability` | `author ID`, `admit ID`, `install ID`, `publish ID`, `govern ID` | Always delegated to the corresponding lifecycle authority. |
| `scenario` | `list CAPABILITY`, `inspect CAPABILITY SCENARIO`, `reveal CAPABILITY SCENARIO` | Exact scenario geometry from the selected capability's capsule. |
| `capsule` | `list`, `inspect CAPABILITY`, `reveal CAPABILITY`, `evaluate CAPABILITY`, `compare CAPABILITY CAPABILITY` | Select the current capsule by capability identity; retain its exact digest. Evaluate/compare can delegate. Historical capsule lookup is not implemented. |
| `capsule` | `admit CAPABILITY`, `publish CAPABILITY` | Always delegated. |
| `execution` | `list`, `inspect ID`, `observe ID`, `explain ID`, `compare ID ID` | Retained local delivery receipts, selected by their returned `exec-UUID` identity. |
| `estate` | `inspect`, `verify` | Existing bootstrap estate integrity and collapsed-layout verification. |
| `profile` | `list`, `search [query]`, `inspect ID`, `resolve ID`, `evaluate ID` | Always delegated. No inferred local registry or eligibility policy. |
| `evidence` | `list`, `inspect ID`, `observe ID`, `explain ID`, `compare ID ID` | Currently the local execution-receipt evidence view. This does not claim an estate-wide evidence index. |

`capability reveal` and `capsule reveal` support `--as scenario|blueprint|feature|contracts`
and the existing scenario-selection rules. `scenario inspect` uses two positional
identities so the scenario's containing capability is explicit.

`provider add` registers an identity reference. It does not parse a vendor SDK,
contact a provider, validate entitlement or admit a provider. Descriptor import is
currently through `--catalog FILE`. `provider configure` delegates configuration
data to its selected capability; it does not create supplier-specific CLI flags.

## Search and discovery

```text
sfx provider search --catalog examples/provider-catalog.json
sfx provider search weather --catalog examples/provider-catalog.json
sfx provider search weather --namespace rapidapi --catalog examples/provider-catalog.json
sfx capability search provider
```

Local provider search is the existing literal catalog filter, optionally scoped
by the generic `--namespace` data filter. With no query, it returns all matching
descriptors. With no configured catalog it returns `DISCOVERY_SOURCE_REQUIRED`.
The sample catalog is illustrative and supplies no live conformance evidence.

Live source discovery and richer search use admitted capabilities:

```text
sfx provider discover <source> --via <discovery-capability> --input @discovery.json
sfx provider search <query> --via <search-capability> --input @search.json
sfx provider inspect <provider> --via <observation-capability> --input @observation.json
```

Replace placeholders with existing identities and inspected canonical contracts.
The source's native metadata, authentication and transport mechanics belong to
the selected provider. Delegated requests carry their scope in canonical input;
`--namespace` is only a local catalog filter and is rejected with delegation.

## Provider testing and admission

```text
sfx provider evaluate <provider> --via <evaluation-capability> --input @evaluation.json
sfx provider admit <provider> --via <admission-capability> --input @admission.json
```

The CLI supports these commands, but a command is not an implementation of a
provider evaluator or admission authority. Missing bindings return
`CAPABILITY_ROUTE_REQUIRED`. A bound operation without canonical input returns
`INPUT_REQUIRED`. A provider test never silently becomes a capsule fixture test.
`capability evaluate ID` remains explicitly scoped to capsule fixtures unless
delegated. A delivered `PROVIDER_REQUIRED`, rejection or hold keeps its meaning.

Entity-specific values belong in canonical request/configuration data. Native-input
capabilities receive the caller's exact input. A capability explicitly declaring
`sfx-semantic-command.v1` receives `{ contractId, command }`, with the complete
validated command including optional `input`. Its authority owns the relationship
between the declared entity and the operation. This is a shared envelope, not an
instance-specific projection. Requests are snapshotted before asynchronous lookup.

The supplied project configuration binds `provider evaluate` to the separate local
`evaluate-http-provider` capability. For example:

```text
sfx provider evaluate rapidapi/yahoo-finance166 --json
```

That capability accepts the shared command envelope, resolves a declared operation
and credential reference, and performs one bounded request. It returns the native
response and declared check results. Its authority scope is
`LOCAL_INSTALLED_CAPABILITY`, with `managedAdmission: NOT_CLAIMED` and no capsule
digest. It is inspectable as a capability; `capsule` operations cannot represent
it as a capsule. Other provider operations still require their own bindings.

The intended managed resolution path is provider identity -> required profile ->
eligible admitted observation/evaluation provider -> canonical result -> CLI
projection. Current `--via` and route bindings are explicit transport seams.
Automatic profile-based resolution remains a separate capability integration.

## Object-scoped bindings

Object-first commands use `sfx-surface-routes.v2`. A route names the complete
object/operation/subject key, preventing provider evaluation from selecting a
capability-evaluation route with the same operation or wildcard.

This is a template; replace the capability and digest placeholders before use:

```json
{
  "routesType": "sfx-surface-routes.v2",
  "routes": [
    {
      "object": "provider",
      "verb": "evaluate",
      "subject": "*",
      "capabilityId": "<admitted-evaluation-capability>",
      "capsuleDigest": "sha256:<64 hexadecimal characters from capability inspection>"
    }
  ]
}
```

```text
sfx provider evaluate <provider> --routes routes.json --input @evaluation.json
```

v2 documents accept only `routesType` and `routes`. Route entries accept only
`object`, `verb`, `subject`, `capabilityId` and
`capsuleDigest`. Undeclared fields such as `runtime`, `model` or `event` are rejected;
those values belong in the appropriate canonical input or provider authority.

Exact subjects precede `*` within the same object and operation. Duplicate keys,
unsupported operations and stale capsule pins fail explicitly. Subjectless list
and search requests use an object/operation wildcard route. The exact query lives
in the supplied input for the selected capability. Receipts retain route identity,
the command object and operation, and native result testimony. Routes do not admit
providers or replace profile eligibility evidence.

`sfx-surface-routes.v3` has the same object/operation/subject matching and closed
fields, with `authorityDigest` replacing `capsuleDigest`. It binds capability
meaning without pretending that a local provider owns an estate capsule. The
runtime manifest independently pins the physical provider and configuration bytes.
Neither document contains embedded credentials or automatic runtime-selection policy.

`sfx.config.json` supplies catalog paths, default route paths and explicit process
runtime manifests. Paths resolve relative to the configuration file, including when
`--config FILE` selects it from elsewhere. Default routes affect matching commands
only. Explicit CLI routes and catalogs override project defaults. SDK callers use
`loadConfiguration()` and pass its result to `createSidefx()` for the same bindings.

## Compatibility and implementation ownership

Existing verb-first forms remain supported, including `sfx invoke`, `sfx inspect`,
`sfx find`, `sfx search`, `sfx evaluate`, `sfx reveal` and `sfx observe`. Legacy
`search NAMESPACE QUERY` treats the namespace as an operand; it does not create a
vendor command. Canonical examples use object-first forms.

`provider add/remove` retain their reference semantics. `provider list` now returns
both `providers` and `registered` arrays; consumers using `registered` retain the
same data. Existing v1 routes remain available to verb-first requests. They are
not silently inferred into object-scoped bindings; migrate to v2 explicitly when
using object-first commands.

The SDK accepts `{ object, verb, subject, input, via }` requests, with `query` for
search and `other` for comparisons. Both CLI and SDK validate the same object model.
Working Node transport, capsule interpretation, execution and receipt mechanics
are reused. Provider-specific behavior belongs behind canonical capabilities,
whose selected provider may use Node, Python, another runtime or an external service.

## Enforcement and extension rules

The canonical CLI/SDK request envelope accepts only `object`, `verb`, `subject`,
`other`, `query`, `scenario`, `as`, `via`, `input` and `namespace`. Undeclared SDK
fields return `REQUEST_FIELD_REJECTED`, just as undeclared shell flags are rejected.
Domain fields remain unrestricted by this envelope inside `input`; the selected
capability's contract validates their meaning. Caller fields cannot override the
adapter, collection, entity type or execution path.

Typed dispatch retains the declared object independently of compatibility
projection. For example, `capability compare exec-... exec-...` reads capsules;
`execution compare` reads receipts. Missing capsule authority never falls back
to an execution receipt with the same spelling. Untyped legacy comparison keeps
its historical selector rules; use the canonical typed form to disambiguate.
Invocation and fixture-proof receipts retain their declared object and operation,
as delegated-operation receipts already do.

The v3 representation also distinguishes `mechanicId`, `providerProfileId` and
`providerCapabilityId`. A mechanic or profile identity never supplies a missing
provider capability identity. Undeclared provider fields are `null`; the exact
native binding remains available. Consumers of the earlier mislabeled v3
`providerCapabilityId`/`provider` fields should use `mechanicId`/`providerProfileId`
for those roles. Human summaries name the roles explicitly.

`npm test` includes `test/neutrality.test.mjs`, and the existing CI job runs it.
The suite checks all supported entity kinds, command-field rejection, overlapping
identifiers, exact scenario/input/event/outcome identities, object-and-operation
route isolation, and preservation of canonical input and native dispositions.
Before the enforcement change, regressions reproduced the identity collision and
ignored command/route fields. These are behavioral checks, not a claim of managed
provider admission or a complete semantic audit of every SideFX surface.

New entity types and operations must have a defined shared contract, an actual
representation or explicit managed delegation boundary, documented evidence scope,
and matching tests. Instance names, model output and provider descriptors cannot
extend the vocabulary. The repository's [contribution rules](../AGENTS.md) make
this invariant explicit for subsequent work. This repository enforces it in its
CLI/shared SDK; other delivery surfaces must preserve the same contracts and need
their own conformance evidence.
