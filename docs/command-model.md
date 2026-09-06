# SideFX command model

## Provider Neutrality Law

No provider, vendor, ecosystem, transport, language, or implementation technology
may introduce a top-level `sfx` command or alter the canonical CLI grammar merely
to expose provider-specific mechanics.

`sfx` speaks the SideFX capability model. Providers supply data and mechanics
behind that model. The canonical shape is:

```text
sfx <object> <operation> [identity]
```

The vocabulary is `provider`, `capability`, `scenario`, `capsule`, `execution`,
`estate`, `profile`, and `evidence`. Supported pairs are explicit; the vocabulary
does not imply that every object supports every operation.

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

Provider-specific values belong in canonical request/configuration data. The CLI
does not inject the command's provider ID, source, query or namespace into that
data. The bound capability owns validation of the request and its relationship
to the provider. Inputs are snapshotted before asynchronous route lookup.

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

Exact subjects precede `*` within the same object and operation. Duplicate keys,
unsupported operations and stale capsule pins fail explicitly. Subjectless list
and search requests use an object/operation wildcard route. The exact query lives
in the supplied input for the selected capability. Receipts retain route identity,
the command object and operation, and native result testimony. Routes do not admit
providers or replace profile eligibility evidence.

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
