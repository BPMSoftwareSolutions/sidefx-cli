# Estate-driven review — 2026-09-06

An adversarial review of whether `sidefx-cli` is genuinely data-driven by the
`agentic-harness` SideFX/SDA capsule estate, and whether any bespoke knowledge of
the capability estate or of a specific provider remains in the CLI.

## Scope and method

| Item | Value |
| --- | --- |
| Reviewed | `bin/`, `src/`, `scripts/`, `packages/http-provider/`, `test/`, `docs/`, `package.json` |
| Estate | `../agentic-harness`, 219 capsules, manifest `sha256:c444ce69…d09937` |
| Baseline | commit `478139c` plus the uncommitted working tree |
| Method | Source read, `grep` over shipped paths, live `sfx` runs against the estate, `npm test` |

The working tree moved during the review. Findings below record the state at the
time each was verified, and the **Status** column reflects the tree as of the last
re-verification.

## Verdict

The architecture is inverted from the stated goal. The estate supplies **instance
data** — capability identities, digests, scenarios, catalog rows. The CLI supplies
**the model** — which entity types exist, which operations each admits, which are
local versus delegated, how a capsule is laid out, how a plan is shaped, and how
results render.

The `sfx-command-surface.v1` work landing during the review opens the right seam, but
resolves it in the wrong shape — see [No fallbacks](#no-fallbacks) below. The rest
remain open.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | No capsule declares `commandBindings` | Critical | **Open** |
| 2 | The command surface is a compile-time constant | Critical | **Seam opened, default retained** |
| 3 | The estate declares surfaces `sfx` cannot reach | Major | **Addressable** |
| 4 | `projection.mjs` hardcodes capsule anatomy | Major | **Open** |
| 5 | The provider hardcodes the CLI's grammar | Major | **Open** |
| 6 | The live-provider path is not reproducible | Critical | **Open** |
| 7 | `HEAD` carries provider endpoint configuration | Moderate | **Fixed, uncommitted** |
| 8 | The redaction control is duplicated and divergent | Moderate | **Open** |
| 9 | The neutrality suite locks the vocabulary closed | Major | **Open** |

## No fallbacks

A built-in default that silently takes over when declared authority is absent is an
anti-pattern here, and it is the shape every remaining recommendation has to avoid.

A fallback that works means the hardcoded model stays operative, stays authoritative
whenever configuration is missing, and never has to be deleted. The estate path is
then permanently optional: it can rot, go unexercised in CI, and drift from the
built-in copy without anything failing. "Data-driven with a sensible default" is
indistinguishable at runtime from "hardcoded, with an override nobody uses" — and it
is the built-in copy, not the estate, that decides what `sfx` is when someone runs it
with no configuration.

The alternative is an explicit boundary. Absent a declared command surface, `sfx`
should refuse with a named error that says which authority is missing and where it is
expected — the same way `EstateRuntime` already refuses without an estate
(`ESTATE_REQUIRED`) and `ProviderCatalog` already refuses without a catalog
(`DISCOVERY_SOURCE_REQUIRED`). Those are the correct precedents already in this
codebase: they do not invent a default estate or a default catalog.

Applied below, this means no `defaultVocabulary` merge target (finding 2), and no
compatibility shim left behind in `projectCapability` (finding 4).

---

## 1. No capsule declares `commandBindings` — Critical

`resolveEntityOperation` in `src/routes.mjs` is the seam through which an estate
entity declares which operations it supports. It reads `entity.commandBindings`.

No capsule in the estate declares that field. Verified three independent ways:

```text
raw grep over capsules/*.sfxcap                        0 / 219
base64, all three byte alignments                      0 / 219
  9tbWFuZEJpbm · vbW1hbmRCaW5 · b21tYW5kQmlu
via the CLI itself
  sfx capability inspect deliver-capability-change-cli
  commandBindings: []
```

The only populated `commandBindings` anywhere are four hand-written rows in
`agentic-harness/authority/cli/provider-catalog.json` — a flat sidecar, not a
capsule, not covered by the estate manifest digest. All four declare the same
`{ object: provider, verb: evaluate, capabilityId: evaluate-http-provider }`.
The mechanism is otherwise exercised only by synthetic fixtures in
`test/provider-runtime.test.mjs`.

**Status: open.** `sfx-command-surface.v1` adds a second, working seam (finding 2),
but it is a project-configuration file. The capsule estate itself still declares
nothing about the command surface.

**Recommendation.** Decide which artifact is authoritative for the command surface
and make the estate emit it — a `capsule-estate.commands.json` alongside the estate
manifest, or a `commandBindings` array in `capability.authority.json`. Until an
estate artifact carries it, "data-driven by the estate" describes a configuration
file, not the estate.

---

## 2. The command surface is a compile-time constant — Critical

At review start, `src/commands.mjs` held a frozen `vocabulary` literal of eight
entity types. `isSemanticObject` was `Object.hasOwn(vocabulary, object)`, and no
configuration key, file or capsule could add a ninth:

```text
$ node bin/sfx.mjs mechanic list
COMMAND_REJECTED: Unknown command mechanic.
```

**Status: the seam is open, the default is retained.** `loadCommandSurface` now
accepts an `sfx-command-surface.v1` document via the `commands` key in
`sfx.config.json`, and the vocabulary is threaded through `parseCommand`,
`semanticCommand`, `resolveEntityOperation`, `resolveRoute` and `render`. The
threading is correct and the loader validates well. Verified end-to-end with a new
entity type the source has never heard of:

```jsonc
// commands.json
{
  "commandSurfaceType": "sfx-command-surface.v1",
  "objects": {
    "mechanic": {
      "list":    { "min": 0, "max": 0, "description": "List declared mechanics" },
      "inspect": { "min": 1, "max": 1, "description": "Inspect one mechanic" }
    }
  }
}
```

```text
$ sfx mechanic list --json                            # no command surface
{"error":{"code":"COMMAND_REJECTED","message":"Unknown command mechanic."}}

$ sfx mechanic list --config …/sfx.config.json --json # with command surface
{"error":{"code":"CAPABILITY_ROUTE_REQUIRED","message":"list requires an explicit capability binding."}}
```

`COMMAND_REJECTED` → `CAPABILITY_ROUTE_REQUIRED` is the whole point: the grammar now
accepts an entity type introduced from data and carries it through to delegation.
The triple-duplicated entity list in `src/index.mjs` is also gone, reduced to the
single `readEntity` switch.

**What this does not fix.** `loadCommandSurface` merges declared objects *over*
`defaultVocabulary`:

```js
const vocabulary = Object.fromEntries(
  Object.entries(defaultVocabulary).map(([object, operations]) => [object, { ...operations }]));
…
vocabulary[object] ??= {};
```

The eight built-in types and every local projection they carry remain the operative
model. With no `commands` key — which is the state of `agentic-harness/sfx.config.json`
today — `sfx` runs entirely on the compiled-in table, exactly as before. Nothing in
the estate is consulted, and nothing fails to signal that.

Per [No fallbacks](#no-fallbacks), the merge target is the problem, not the loader.
`defaultVocabulary` should not exist. `loadCommandSurface` should be the only source
of the vocabulary, and a missing command surface should raise a named error naming
the expected authority — not silently seat eight entity types the estate never
declared.

That change also forces the two smaller gaps into the open rather than hiding them:

- `delegatedVerbs` in `src/routes.mjs` is still a hardcoded array, so the verb-first
  aliases remain a closed second grammar with no declared source.
- A declared operation is always `Object.freeze({ …spec, bindable: true, declared: true,
  projection: null })`, so data can add delegated operations but cannot describe a
  locally projected one. Every local projection — `inspect`, `list`, `reveal`,
  `observe`, `explain`, `compare` and the rest — is reachable only from the built-in
  table. Removing the default means these need a declared representation too, which is
  the real remaining work and the reason the default is load-bearing today.
- `validateSemanticRequest` skips all identity validation when `spec.declared` is set.
  Built-in types get identity rules; declared ones get none. Both should get their
  rules from the same declared source.

---

## 3. The estate declares surfaces `sfx` cannot reach — Major

These are admitted, fixture-proven capabilities in the estate:

```text
deliver-capability-change-cli    "one stable `sidefx change` command surface"
deliver-capsule-estate-cli
deliver-capability-change-mcp
deliver-realization-api
open- / seal- / publish- / observe-capability-change
```

`deliver-capability-change-cli` is the estate's own declaration of a CLI surface,
carrying four scenarios including `bind-capability-change-cli-command`. `sfx` has no
`change` object. You can inspect the capability; you cannot execute what it
delivers.

**Status: addressable.** With finding 2 resolved, a command surface document can
declare `change` and bind its operations to those capabilities. Nothing has declared
it yet, and per finding 1 the declaration would live in project configuration rather
than in the estate that owns the capabilities.

---

## 4. `projection.mjs` hardcodes the capsule's internal anatomy — Major

`src/projection.mjs` knows, structurally:

- entry filenames `capability.authority.json`, `blueprint.authority.json`
- `capsule.runtimeBindings[0]` — **silently takes the first binding**; a multi-target
  capsule projects one and reports nothing about the rest
- a plan-type allowlist `consumer-execution-embodiment-plan.v1|v2|v3` — an estate
  emitting a v4 plan breaks `inspect` for every capability
- `cell.altitude === 'scenario'` and the cellId format `cell:scenario:${id}`
- Gherkin tag prefixes `@scenario:` `@input:` `@event:` `@outcome:` `@outcome-terminal`
- `realizationOverlay.providerBindings` versus `mechanicBindings` shape-sniffing

The `.feature` / `.feature.sidefx` lookup appears verbatim in **both**
`src/projection.mjs` and `src/runtime-worker.mjs` — two copies of one heuristic that
must stay in sync across a process boundary. `src/runtime-worker.mjs` also hardcodes
the estate's directory layout (`capsules/capsule-estate.manifest.json`) before
requiring `@cucumber/gherkin` out of the estate's bootstrap: the CLI knows the
estate's authoring language.

**Status: open.** This is the largest remaining body of estate knowledge in the CLI.
The plan-type allowlist is the sharpest edge — it converts an estate format upgrade
into a total `inspect` outage whose cause is only discoverable in CLI source.

**Recommendation.** Have the bootstrap return an already-projected capability
representation and **delete** `projectCapability`. `ConfiguredRuntime` already takes
this path for `sfx-capability-representation.v1`, so the shape and the consuming code
both exist; what is missing is the estate emitting it.

Per [No fallbacks](#no-fallbacks), do not keep `projectCapability` as a shim for
estates that do not yet emit a representation. A retained shim is the same trap as
`defaultVocabulary`: it is the path that actually runs today, so it would stay the
real implementation while the supported path goes unexercised. Move the projection
into the bootstrap, then require the representation and fail with a named error when
an estate does not supply one.

---

## 5. The provider hardcodes the CLI's grammar — Major

`packages/http-provider/worker.mjs`:

```js
&& input.command.object === 'provider' && input.command.verb === 'evaluate'
```

The descriptor-driven, provider-neutral worker is pinned to one object/verb pair
from the CLI's vocabulary. The CLI is forbidden to know about providers; the
provider knows the CLI's grammar. Neutrality was enforced in one direction only.

This also raises the cost of finding 2's remaining work: renaming or restructuring a
built-in operation breaks every provider worker.

**Status: open.** The provider should validate against its own declared
`inputContractId` and treat `command` as opaque canonical data.

---

## 6. The live-provider path is not reproducible — Critical

`agentic-harness/authority/provider-connections/bounded-http.runtime.json`
digest-pins `module:@sidefx/http-provider`. That package resolves to
`agentic-harness/node_modules/@sidefx/http-provider`, which is a byte-identical copy
of `packages/http-provider` — verified `sha256` on `worker.mjs`, `http.mjs`,
`credentials.mjs` and `capability.json` — and it is:

```text
gitignored                     .gitignore:9
in harness dependencies        no
in package-lock.json           no  (0 matches)
placed                         2026-09-06 18:34, by hand
```

`npm ci` in the harness removes it and the digest-pinned path fails with
`RUNTIME_PACKAGE_REQUIRED`. Meanwhile `packages/http-provider` is `private: true`
and excluded from the CLI's `files` array, so it has no publication path either.

**The commits claiming live provider verification depend on a manual file copy that
no clean checkout reproduces.** The evidence in `docs/evidence/` is real, but it is
not currently regenerable by anyone else.

**Recommendation.** Publish `@sidefx/http-provider` (or vendor it into the harness as
a tracked path dependency) and add it to the harness's `dependencies` and lockfile,
then re-run `scripts/bind-runtime.mjs` so the pinned digests match an installable
artifact.

---

## 7. `HEAD` carries provider endpoint configuration — Moderate

Shipped source is clean:

```text
$ grep -rniE "rapidapi|weather|yahoo|finance|x-api-key" bin/ src/ scripts/
(none)
```

But `git HEAD` still contains `config/http-providers.json` — 187 lines of
`realty-us.p.rapidapi.com`, `X-RapidAPI-Host`, `RAPID_API_KEY` and a hardcoded
`fulfillmentId: "3155600"` — along with `config/provider-catalog.json`,
`config/routes.json` and `examples/local-http.config.json`.

**Status: fixed but uncommitted.** The working tree deletes all four. Until that is
committed, the claim is true of the working tree and false of every commit anyone can
clone. `examples/provider-catalog.json` remains in `package.json` `files` and still
carries `rapidapi/weatherapi`; it is illustrative and labelled as such, but it does
ship.

---

## 8. The redaction control is duplicated and divergent — Moderate

`src/data.mjs` and `packages/http-provider/credentials.mjs` each carry a secret-name
regex, and they are not the same. `data.mjs` has a separate
`(?:^|[-_])[a-z0-9]*api[-_]?key` branch that matches `x-rapidapi-key`;
`credentials.mjs` inlines a narrower `api[_-]?key`. Two copies of a security control,
already drifted, on opposite sides of a process boundary.

**Recommendation.** One exported helper, imported by both, or an explicit comment in
each stating why the two must differ.

---

## 9. The neutrality suite locks the vocabulary closed — Major

`docs/command-model.md` states: *"Supported operations and relationships — Entity type
and its shared contracts"* and *"The vocabulary is provider, capability, scenario,
capsule, execution, estate, profile, and evidence."* A closed set, asserted as law.

Entity Neutrality as written forbids **instances** from adding syntax; it is silent on
**types** being compiled in. The implementation therefore passed its own law while
failing the data-driven requirement.

`test/neutrality.test.mjs` goes further and enforces the closure:

```js
for (const instance of ['approve-mortgage', 'weather-observation',
                        'python', 'rapidapi', 'publish-payment'])
  assert.throws(() => parseCommand([instance, 'inspect']),
                error => error.code === 'COMMAND_REJECTED');
```

The suite cited as proof of neutrality iterates the built-in list and asserts that
anything outside it is rejected. That is a regression lock on the closed vocabulary,
not a neutrality guarantee — and it now under-tests the shipped behaviour, because
with a command surface those same identifiers dispatch.

**Status: open, and the suite is red.** `npm test` is **50 pass / 1 fail**.
`test/cli.test.mjs` still asserts `provider inspect not-namespaced` is rejected, but
the `isProviderId` change made provider identities opaque. That is a stale assertion
encoding the `namespace/name` format knowledge the change deliberately removed — it
should be updated to match the new intent, not reverted.

**Recommendation.** Replace the closed-vocabulary assertion with its inverse: load a
command surface declaring an entity type absent from `defaultVocabulary`, and assert
it parses and dispatches. Then update `docs/command-model.md` so the vocabulary is
described as the default surface rather than the law.

---

## What holds up

- All shipped source (`bin/`, `src/`, `scripts/`) is free of vendor strings. Provider
  identities are now opaque, so the CLI no longer imposes a `namespace/name` shape.
- `sfx capability list` returns all 219 live capabilities against the real estate;
  `integration/estate.test.mjs` proves CLI/SDK/bootstrap invocation parity.
- `packages/http-provider` is authentically descriptor-driven: origins, paths,
  parameters, credential references and response checks all come from configuration.
  It contains no RapidAPI knowledge, and it is excluded from the published package.
- Digest pinning across capsule, capability-authority, runtime-manifest and receipt
  boundaries is thorough and consistently enforced.
- `loadCommandSurface` validates its document strictly — closed key sets, prototype-key
  rejection, exact authority pins on bindings. The seam is well built; only its default
  is wrong.
- `EstateRuntime` and `ProviderCatalog` already refuse rather than invent a default
  estate or catalog. That is the pattern the command surface and capsule projection
  should follow.

## Suggested order of work

1. **Commit the `config/` deletions** (finding 7) so the published history matches the
   claim.
2. **Author a command surface and point the harness at it** (findings 1 and 3) — the
   estate emits `sfx-command-surface.v1`, `sfx.config.json` gains its `commands` key.
   This has to come before step 3, because it is what the CLI will run on afterwards.
3. **Delete `defaultVocabulary`** (finding 2) and make a missing command surface a
   named failure. This is the step that converts the claim from optional to true, and
   it is where the local-projection gap has to be solved rather than deferred.
4. **Invert the neutrality assertion and fix the red test** (finding 9) so CI protects
   the declared surface instead of the deleted default.
5. **Make `@sidefx/http-provider` installable** (finding 6) so the live-provider
   evidence is regenerable.
6. **Move capsule projection into the bootstrap and delete `projectCapability`**
   (finding 4).
7. Unpin the provider from the CLI grammar (5) and de-duplicate redaction (8).

Steps 2 and 3 are one change in two commits, not two independent pieces of work.
Landing 3 without 2 leaves `sfx` unable to run against the harness at all; landing 2
without 3 leaves the built-in table operative and the estate path unexercised, which
is the state this review is about.
