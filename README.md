# SideFX CLI

Repository: [BPMSoftwareSolutions/sidefx-cli](https://github.com/BPMSoftwareSolutions/sidefx-cli).
The workspace and npm package are named `sidefx-cli`; the terminal command is `sfx`.

`sfx` is a capability interface over an existing Managed Capability Estate. The
current JavaScript/Node implementation is a **candidate interface provider**.
It reveals capsule-owned meaning and delegates estate execution to the installed
`sda-bootstrap`. Explicitly configured local capabilities can also execute through
a digest-bound process provider. These are separate authority scopes; a local
provider is never represented as an admitted estate capsule.

**Capability requirements determine the required profile. Eligible admitted
providers are resolved against constraints and evidence. The selected provider
determines the physical runtime.** Python, Node, Go, C#, Java and external services
may satisfy different profiles. The current CLI does not yet implement that
general provider-resolution circuit. Its shared SDK is a useful integration seam.
See the [responsibility and runtime review](docs/responsibility-runtime-review.md).

**Entity Neutrality Law:** no entity instance, business domain, provider or
implementation technology introduces special interface syntax. Entity-specific
meaning and behavior resolve through canonical SideFX authority. This applies to
capabilities, scenarios, inputs, events, outcomes, providers and every other entity.
Provider Neutrality is one case of this broader law.

```text
sfx <object> <operation> [identity]
```

The objects are `provider`, `capability`, `scenario`, `capsule`, `execution`,
`estate`, `profile`, and `evidence`. The [command model](docs/command-model.md)
defines supported operations, current evidence scopes, delegation and compatibility.
Entity types define supported operations; identities select instances; authority
defines meaning and contracts; eligible providers supply execution mechanics.
The declared type survives dispatch even when an ID resembles another entity kind.
Inputs, events and outcomes are currently exposed through their containing scenario
and capsule authority, rather than standalone top-level commands.

## Run it

Requires Node.js 20 or newer. This package has no npm dependencies. The estate
must have its own pinned runtime installed (`npm ci` in that estate when needed).
The supplied local HTTP evaluation provider works independently of an estate.

Clone the repository, or open the existing workspace at
`C:\lab\repos\sidefx-cli`:

```text
git clone https://github.com/BPMSoftwareSolutions/sidefx-cli.git
cd sidefx-cli
```

From the workspace:

```powershell
npm ci
node bin/sfx.mjs --help
node bin/sfx.mjs capability list --estate C:\lab\repos\agentic-harness
```

To make `sfx` available on your command path:

```text
npm install --global .
```

## Test the configured providers

From `C:\lab\repos\sidefx-cli`, with `sfx` installed:

```powershell
sfx provider evaluate rapidapi/realty-us --json
sfx provider evaluate rapidapi/yahoo-finance15 --json
sfx provider evaluate rapidapi/yahoo-finance166 --json
sfx provider evaluate rapidapi/yahoo-finance-real-time1 --json
```

The project configuration selects a separate [HTTP provider package](packages/http-provider/README.md).
Provider instances are [configuration data](config/http-providers.json), not CLI
branches. It uses the existing Windows user environment variable `RAPID_API_KEY`;
the credential is resolved inside the provider. On another OS, configure an
available credential reference and rebind the local runtime as documented by the package.

The September 6 [CLI test](docs/rapidapi-provider-smoke-test-2026-09-06.md) of the
user-selected operations returned HTTP 200 with valid JSON for Realty US listings,
Yahoo Finance15 news and Yahoo Finance166 news. Yahoo Finance Real Time options
returned HTTP 403 with a missing-subscription message. Each invocation performed
one request and retained an execution receipt. The configured defaults reproduce
the supplied fulfillment ID, tickers, snippet count, symbol, language and region.

This is local provider execution, not Harness admission. `PASSED` covers the
selected operation's declared checks; it does not establish data freshness or
provider interchangeability. These four operation defaults check HTTP status and
JSON syntax; they do not declare complete response schemas. CLI exit 0 means delivery completed: inspect
`result.disposition` for the evaluation result.

From another directory, supply the project configuration explicitly:

```powershell
sfx provider evaluate rapidapi/yahoo-finance166 --config C:\lab\repos\sidefx-cli\sfx.config.json --json
```

`sfx.config.json` is loaded from the current directory. Its paths resolve relative
to that file. Explicit `--catalog` and `--routes` override their project defaults.
Default routes apply only to matching object/operation/identity keys. Missing
bindings keep their explicit error; no provider is selected by name heuristics.

## Use an estate

Choose the estate once per shell. PowerShell:

```powershell
$env:SIDEFX_ESTATE = 'C:\lab\repos\agentic-harness'
sfx capability search interlock
sfx capability inspect interlock-agent-operation
sfx scenario list interlock-agent-operation
sfx capsule reveal interlock-agent-operation --scenario adjudicate-covered-agent-tool-call
```

Linux or macOS:

```bash
export SIDEFX_ESTATE=/path/to/agentic-harness
sfx capability list
sfx capability inspect interlock-agent-operation
```

The command grammar is identical across shells; only environment-variable and
quoting syntax differ. Use `--input @request.json` to avoid shell JSON quoting.

## Engineering flow

```text
sfx capability search interlock
sfx capability inspect interlock-agent-operation
sfx scenario list interlock-agent-operation
sfx capability reveal interlock-agent-operation --as contracts
sfx capsule reveal deliver-capsule-estate-cli --as blueprint
sfx capability providers interlock-agent-operation
sfx capability resolve interlock-agent-operation
sfx estate inspect
```

`reveal` reads the exact capsule's feature, blueprint, scenario geometry, or
contracts. It supports execution plans v1, v2, and v3. Unknown representations
produce an explicit finding. `--scenario` selects a scenario view or annotates
the selected scenario in the complete, unchanged blueprint.

`resolve` verifies the current capsule and the estate's declared dependency
closure. A provider-selection request can instead delegate to its own authority:

```text
sfx capability resolve provider-selection --via resolve-sidefx-eligible-providers --input @request.json
```

Inspect the selected capability's current contracts before preparing its input.
For native-input capabilities, this command passes supplied JSON unchanged. A
capability that explicitly declares `sfx-semantic-command.v1` instead receives
the complete validated command as its canonical input; its authority validates
the entity relationship. The CLI supplies no provider-specific projection.

## Execute and inspect evidence

```text
sfx capability invoke resolve-sidefx-eligible-providers --input @request.json --json
sfx execution observe exec-UUID --json
sfx execution explain exec-UUID
sfx execution list
sfx execution compare exec-UUID-ONE exec-UUID-TWO
```

Replace `exec-UUID` with the exact ID returned by invocation. JSON can also be
provided inline, or via `--input -` to read standard input. Capability-specific
flags such as `--location` are not invented from a capability name: the current
canonical request contract determines where those values belong in the JSON.

Execution delegates to the installed runtime. The terminal does not supply
provider implementations, fallback rules, or admission decisions. Returned
results preserve the runtime's disposition, outcome, scenario trace and
observations. A successful process exit means the result was delivered; a
returned `NOT_OBSERVABLE`, hold, rejection, or `PROVIDER_REQUIRED` retains its
original meaning.

Local delivery receipts are written under `~/.sidefx/executions`. Override this
with `--state PATH` or `SIDEFX_HOME`. A receipt records the exact capsule,
capability-authority digest, estate generation, input digest, result digest,
timestamps and result. Input values are not stored. Common secret fields in
stored results are redacted; arbitrary provider text is not automatically
classified. `--json` invocation output retains the actual returned result.

Receipts have a content digest checked on observation. They are local testimony,
not signed attestations or managed admission receipts. A timeout or interrupted
process can leave an incomplete receipt and does not establish cancellation of
external effects. The terminal never retries an invocation automatically.

## Discover providers

```text
sfx provider search weather --catalog examples/provider-catalog.json
sfx provider search observability --namespace cncf --catalog examples/provider-catalog.json
sfx provider add rapidapi/weatherapi
sfx provider inspect rapidapi/weatherapi --catalog examples/provider-catalog.json
sfx provider list --catalog examples/provider-catalog.json
```

The included catalog is **illustrative**, derived from the intent document.
It contains no live provider observations, conformance passes, or admitted
candidate capabilities. Replace it with source-attributed provider descriptors
using the same JSON structure. Repeat `--catalog FILE` to include more catalogs;
duplicate identities fail explicitly. Other namespaces use the same format.

`provider add` registers a local reference. It does not contact the provider or
admit its capabilities. `provider remove` removes only that local reference.
`provider search` searches all supplied catalogs; `--namespace NAME` is an optional
data filter. `provider list` returns catalog descriptors and registered references
separately. `capability providers <capability>` shows capsule-bound mechanics
separately from matching discovery candidates.

Live discovery uses `sfx provider discover <source> --via <discovery-capability>
--input @discovery.json`. Managed provider observations can use the same binding
form with `provider inspect`. Source dialect, authentication, transport and native
operations belong to the selected provider capability. The CLI has no marketplace
scraper, vendor flags or automatic credential use.

## Evaluate, assimilate and govern

```text
sfx capability evaluate resolve-sidefx-eligible-providers
sfx provider evaluate rapidapi/weatherapi --via <evaluation-capability> --input @evaluation.json
sfx provider admit rapidapi/weatherapi --via <admission-capability> --input @admission.json
sfx provider assimilate rapidapi/weatherapi --via <assimilation-capability> --input @assimilation.json
sfx capability author <capability> --via <authoring-capability> --input @authoring.json
sfx capability install <capability> --via <realization-capability> --input @realization.json
sfx capability govern <capability> --via <governance-capability> --input @governance.json
sfx capability publish <capability> --via <publication-capability> --input @publication.json
```

Angle-bracket values above must identify actual estate capabilities. Capability
evaluation without a binding runs the named capability's existing fixtures and labels its
receipt `CAPSULE_FIXTURE_PROOF`. It makes no provider-conformance claim.
Provider evaluation, admission and the other lifecycle actions require explicit
capability bindings. The illustrative catalog supplies no live evaluator. Profile
queries also delegate to a bound capability; the CLI does not infer provider
eligibility from a namespace or manufacture a profile registry.

For reusable bindings, supply `--routes routes.json` instead of `--via`. A route
document has `routesType: "sfx-surface-routes.v2"` and a `routes` array. Each route
contains `object`, `verb`, `subject`, `capabilityId`, and `capsuleDigest`; read the latter
from `sfx capability inspect <capability> --json`. A subject of `*` is a fallback; exact
subjects take precedence. Changed capsule digests fail with `ROUTE_STALE`.
Routes match within the same object and operation. They are transport configuration,
not new capability authority. Existing verb-first commands remain compatibility
aliases and retain v1 route support; object-first commands require v2 routes.

The Harness owns the managed lifecycle, including review, proof, admission,
sealing and publication. The terminal cannot skip a lifecycle stage or turn
provisioned open slots into implemented behavior. Missing provider authorities
return `CAPABILITY_ROUTE_REQUIRED`; they never return fabricated success.

## Use the SDK

```javascript
import { createSidefx } from 'sidefx-cli';

const sfx = createSidefx({ estateRoot: '/path/to/agentic-harness' });
const capability = await sfx.execute({ object: 'capability', verb: 'inspect', subject: 'interlock-agent-operation' });
const scenarios = await sfx.execute({ object: 'scenario', verb: 'list', subject: capability.capabilityId });
```

`execute()` accepts the same object/operation requests used by the shell, including
`{ object: 'provider', verb: 'search', query: 'weather', namespace: 'rapidapi' }`.
Legacy requests without `object` remain supported. `invoke(id, input)` performs
an exact capability invocation and returns its execution ID and canonical result.
`EstateRuntime` is exported for consumers that need the shared bootstrap adapter.

## Verify

```text
npm test
npm pack --dry-run
```

The portable tests use explicit protocol doubles; they do not claim an admitted
test estate. Live integration is opt-in and invokes only the read-only
`resolve-sidefx-eligible-providers` capability and its focused fixtures:

```powershell
$env:SIDEFX_INTEGRATION_ESTATE = 'C:\lab\repos\agentic-harness'
npm run test:integration
```

CI is configured for Windows, macOS and Linux on Node 20 and 22. See
[architecture and coverage](docs/architecture.md) for the authority boundaries
and [verification results](docs/verification.md) for the completed local checks.
