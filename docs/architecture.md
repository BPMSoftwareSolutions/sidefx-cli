# Terminal projection architecture

The current implementation delegates through the installed bootstrap's declared
executable and the surfaces in `sfx.commands.json`. The older adapter and local
provider descriptions below are historical; use
[estate delivery verification](estate-delivery-verification-2026-09-08.md)
for the exercised current boundary.

The updated [intent](intent.md) establishes `sfx` as the terminal command name.
SideFX remains the product and capability namespace.

The adopted [Entity Neutrality Law and command model](command-model.md) make
`sfx <object> <operation> [identity]` canonical. The shared CLI/SDK command model
validates semantic object/operation pairs and projects supported local operations
onto existing mechanics. Every entity identity and domain value is data; Provider
Neutrality is one case of the broader invariant. The declared type is retained
through dispatch and execution testimony. Typed reads never select another entity
kind merely because an identifier resembles a provider reference or receipt ID.

Repository and package: `sidefx-cli`. This document describes the current Node
candidate implementation. It does not assign semantic capability ownership to
Node. The [responsibility review](responsibility-runtime-review.md) identifies
the required profiles, candidate runtime families and boundaries that need to
resolve through shared managed capabilities.

```text
sfx argv / canonical JSON
    -> shared SDK
       -> existing estate bootstrap (isolated Node process)
          -> verified capsule identity and scenario authority
          -> existing runtime admission, providers and outcome
       -> local delivery evidence
    -> human representation or JSON
```

## Ownership

The CLI/SDK contains command parsing, public metadata inspection, process transport,
representation and local delivery receipts. It contains no domain provider implementation
or provider-specific contract dispatch. Entity metadata declares exact operation-to-capability
relationships; the selected estate supplies runtime bindings and capability authority.
Providers own input interpretation, effects, credentials and outcome meaning.

The HTTP reference provider is a separate package installed in Harness. Its source
remains under `packages/http-provider` for maintenance and tests, but neither its
implementation nor vendor configuration is included in the CLI package or exports.
The CLI does not copy the estate runtime, evaluate its semantic expressions or
implement another managed lifecycle.

Local process capabilities carry a `sfx-capability-representation.v1` authority
document and `sfx-process-runtime.v1` physical binding. Their authority and runtime
digests are retained independently. A v3 route pins the capability authority; the
runtime manifest pins the worker and its configuration. Changes fail before
execution until the reviewed binding is updated. These local pins confer no
Harness admission or publication, and are not signatures. Such a capability has
no capsule digest and is never projected as an estate capsule.

The generic process driver passes one JSON request on stdin and expects one JSON
response on stdout, with bounded output and a timeout. The envelope carries the
exact capability identity and authority digest, unchanged native `input`, and
optional unchanged `command` context. It constructs no capability-specific input
wrapper. Native capsule invocation continues to receive the exact canonical input.
The driver uses no shell, drains diagnostics separately, and preserves the provider's
result. The protocol permits any explicitly configured executable runtime.
Automatic eligibility ranking remains a separate capability responsibility.

The adapter imports the selected estate's installed `sda-bootstrap` exports:
`loadEstate`, `verifyEstate`, `listCapsules`, `inspectCapsule`, `resolveEstate`,
`invokeCapability`, `proveDirectExecution`, and `assertCollapsedRepository`.
These are also the shared resolver/runtime responsibilities beneath the existing
API and MCP surfaces. Bootstrap availability does not imply every domain behavior
in the intent has already been admitted.

Workers run with an explicit root and without inherited experimental capsule
overlays or platform replacements. Structured requests travel over Node IPC;
no shell evaluates user input. Provider diagnostics cannot corrupt JSON stdout.
The adapter compares estate-manifest bytes before and after loading and checks
the same generation and selected capsule again before execution.

## Representation

The bootstrap verifies capsule and entry digests before projection. Scenario
views read v1/v2 plan nodes or v3 canonical graph cells. For v3, scenario identity
and Given/When/Then names come from the capsule's feature, parsed by the runtime's
installed Gherkin parser. Canonical cell and provider binding records remain
available in JSON, with source digests. Unknown geometry fails explicitly.

V3 bindings expose mechanic, provider-profile and provider-capability identities
as separate fields. Unobserved identities stay `null`; native bindings are retained.
Human summaries label the distinct roles instead of treating a mechanic name as
evidence that a provider capability was selected.

Blueprint views return the complete capsule-owned blueprint. They do not generate
a diagram and label it admitted. Contract views return the plan's contract
authorities, including their schema identities and digests. Structural comparison
reports JSON-pointer differences; only a delegated capability can evaluate
semantic equivalence.

## Behavior coverage

| Intent surface | Implemented boundary |
| --- | --- |
| `capability list/search/inspect` | Verified estate discovery and capsule-owned meaning |
| `scenario list/inspect`, `capsule reveal` | Existing scenario, blueprint, feature and contract views |
| `capability providers` | Existing mechanic bindings plus separately labeled catalog candidates |
| `capability resolve` | Existing capsule/dependency closure, or an explicitly delegated resolver |
| `capability invoke` | Exact canonical JSON to the existing capsule runtime |
| `execution observe/explain`, `evidence inspect` | Durable local delivery receipts and original returned testimony |
| Object-scoped `compare` | Structural differences, or an explicitly delegated comparison authority where supported |
| `provider search/inspect/list` | Supplied discovery catalogs with provenance and separate reference records |
| `provider add` | Local reference registration |
| `capability evaluate` | Named capsule fixture proof, or an explicitly delegated evaluator |
| `provider discover/evaluate/admit/configure`, `profile` queries | Explicit capability routes and canonical input |
| Object-scoped `assimilate/author/install/govern/publish/admit` | Explicit capability routes and canonical input; lifecycle remains in the estate |
| `estate inspect` | Verified estate integrity and durable layout |

Object-first routes use v2 keys containing object, operation and subject. Exact
subject matching and wildcard fallback stay within the same object/operation.
Legacy verb-first requests retain v1 routes. Binding configuration and argument
normalization do not establish provider eligibility or admission. Local profile
inference and supplier-specific command branches are absent.

Canonical SDK requests and v2 route entries reject undeclared control fields.
Entity-specific values travel inside canonical input/configuration and are validated
by the selected authority. Scenario views retain input, event and outcome identities
without deriving business behavior from their names. These are capsule-owned
entities even though they have no standalone top-level commands in this adapter.

Live discovery, WeatherAPI invocation, provider assimilation, provider selection
policy, remote distribution, and enterprise publication need the corresponding
provider/capability authority and input. The local HTTP provider now supplies
bounded evaluation for four configured RapidAPI operations, verified through
`sfx provider evaluate`. It makes no complete-schema, freshness, interchangeability,
admission or publication claim. The Harness's separate RapidAPI tokens retain
their open event-mechanic slots; this configured provider does not close those slots.

Harness now owns the executable evaluation configuration: capability authority,
operation descriptors, catalog operation bindings and process connection. The selected
estate's configuration takes precedence over the invoking project's defaults.
The HTTP provider receives both the Harness operation file and its exact capability
authority file. Independently installed package exports locate mechanics, with artifact
digests checked before invocation. No absolute source-checkout path is required by
the Harness connection. Scope and source paths are retained in the execution receipt.

The content-creation workspace informed the evidence and teaching model. It is
not a runtime dependency. No frozen corpus or example provider is imported as
current managed authority.

## Receipts and process outcomes

Receipts retain entity and operation-binding digests, native input and command
digests, exact capability authority, and runtime binding. Optional metadata is
serialized before hashing so sparse public representations remain verifiable.
Receipt files begin in `RUNNING` before a capability executes, then atomically
transition to `RETURNED` or `DELIVERY_FAILED`. A failure to create the initial
receipt prevents execution. Failure to finalize a returned result reports that
the effect may already have occurred and retains its execution identity.

`RETURNED` means that the runtime returned a value. The runtime's business
disposition remains inside `result`; the terminal supplies no success heuristic.
The receipt's SHA-256 digest covers its stored, redacted representation. The
separate result digest covers the original result. Input values are represented
only by their digest. Digests detect accidental edits; they provide no signed
authentication or protection against a writer who replaces both data and digest.

A timeout kills the delivery worker. External provider processes/effects may
outlive it, and the bootstrap's disposable workspace cleanup may be incomplete.
An abrupt terminal or host failure can leave `RUNNING`; observation does not
invent completion or retry the effect.

| Exit | Meaning |
| --- | --- |
| 0 | Command result delivered; inspect its domain disposition |
| 2 | Invalid syntax, option, JSON input, or local descriptor shape |
| 3 | Requested estate, authority, representation, or binding unavailable |
| 4 | Runtime, storage, timeout, or integrity failure |

## Validation scope

Unit and process tests cover canonical input transport, isolated stdout,
argument validation, paths with shell metacharacters, missing/stale authority,
receipt persistence and corruption, failed delivery, concurrency, route binding,
discovery provenance and fixture-proof labeling. Live tests exercise all three
plan generations, compare a real resolver invocation with direct bootstrap
execution (observation timestamps belong to their separate executions), compare
CLI and SDK observation of the same receipt, and run focused provider-resolution
fixtures. The entity-neutrality suite checks typed identifier collisions, rejection
of undeclared command/route fields, scoped route resolution, and exact preservation
of scenario/input/event/outcome authority. The operating-system CI matrix does not
imply it has run locally or that other delivery surfaces have been qualified.
