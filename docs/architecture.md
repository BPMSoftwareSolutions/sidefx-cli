# Terminal projection architecture

The updated [intent](intent.md) establishes `sfx` as the terminal command name.
SideFX remains the product and capability namespace.

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

This implementation currently contains command parsing, process transport,
representation and local delivery receipts. Their location in this repository
does not make it the authority for those responsibilities. It consumes the estate
chosen by the caller. It does not
modify the Harness, copy its runtime, evaluate its semantic expressions, create
provider bindings, or implement a second managed lifecycle.

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

Blueprint views return the complete capsule-owned blueprint. They do not generate
a diagram and label it admitted. Contract views return the plan's contract
authorities, including their schema identities and digests. Structural comparison
reports JSON-pointer differences; only a delegated capability can evaluate
semantic equivalence.

## Behavior coverage

| Intent surface | Implemented boundary |
| --- | --- |
| `list`, `find`, `inspect` | Verified estate discovery and capsule-owned meaning |
| `scenarios`, `reveal` | Existing scenario, blueprint, feature and contract views |
| `providers` | Existing mechanic bindings plus separately labeled catalog candidates |
| `resolve` | Existing capsule/dependency closure, or an explicitly delegated resolver |
| `invoke` | Exact canonical JSON to the existing capsule runtime |
| `observe`, `explain` | Durable local delivery receipts and original returned testimony |
| `compare` | Structural differences, or an explicitly delegated comparison authority |
| `search rapidapi`, `search cncf` | Supplied discovery catalogs with provenance |
| `provider add` | Local reference registration |
| `evaluate` | Named capsule fixture proof, or an explicitly delegated evaluator |
| `assimilate`, `author`, `install`, `govern`, `publish` | Explicit capability routes and canonical input; lifecycle remains in the estate |

Live discovery, WeatherAPI invocation, provider assimilation, provider selection
policy, remote distribution, and enterprise publication need the corresponding
admitted provider/capability authority and input. This implementation does not
claim those domain systems are complete. In particular, the Harness's current
RapidAPI demonstration documents open event-mechanic slots and
`PROVIDER_REQUIRED`; a shell alias cannot close them.

The content-creation workspace informed the evidence and teaching model. It is
not a runtime dependency. No frozen corpus or example provider is imported as
current managed authority.

## Receipts and process outcomes

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
fixtures. The operating-system CI matrix does not imply it has run locally.
