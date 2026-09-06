# Verification — September 6, 2026

## Harness-owned configuration and installed provider execution

All 48 CLI/SDK/process tests pass. Added coverage proves estate selection from
another working directory, environment selection, explicit configuration precedence,
no implicit project fallback, installed package artifact resolution, changed and
unpinned artifact rejection, and execution using estate authority whose bytes differ
from the provider's bundled example. Receipts retain the authority and connection
locations. The 219-capability estate integration also passed, including native
invocation parity and focused fixture proof.

The live Finance166 news invocation through `sfx --estate` returned HTTP 200,
`status: OK`, and `PASSED`, with all three declared response-field checks passing.
Its [verified evidence](evidence/provider-cli-harness-finance166-2026-09-06.json)
records the command, exact Harness authority and provider connection, response
digest, HTTP facts and receipt digest. No credential value is stored in repository
configuration or this evidence. This verifies configured capability execution;
the existing provisioned tokens were not promoted to admitted capsules.

## Local provider execution repair

The repair passed 45 CLI/SDK/process tests on Windows. Eight new tests exercise
the actual CLI against local HTTP servers: cross-namespace evaluation, status/JSON/
field failures, no redirects or retries, credential and input rejection before
effects, stale bindings, size/time limits, redaction, receipt failure, local
capability/capsule distinction and SDK request snapshots.

The estate integration also passed against 219 existing capabilities, including
runtime parity, CLI/SDK receipt parity and focused fixture proof. An npm archive
was installed in `.sidefx/provider-package-smoke/installed`; its generated command
resolved the relocated runtime's artifact digests and four provider descriptors.
The development `sfx` command was linked to the working repository.

Both live batches used the installed CLI and produced independently retained
execution receipts. The initial candidates yielded one HTTP 200 and three HTTP
403 responses. The user's corrected products and operations yielded three HTTP
200 JSON responses and one HTTP 403 subscription denial. Every invocation made
one request; all receipts were read back through `sfx execution observe`.
See the [test report](rapidapi-provider-smoke-test-2026-09-06.md) and
[current verification summary](evidence/provider-cli-selected-2026-09-06.json).

This proves the configured local provider path, not Harness admission, GET revision
publication, full native response conformance or provider interchangeability.
Provider mechanics live in `packages/http-provider`; generic runtime transport
and local delivery receipts live in `src`.

## Earlier verification history

The command name is `sfx`; the package is now named `sidefx-cli`. The initial
checks below were performed before the repository/package rename.

| Check | Observed result |
| --- | --- |
| Portable unit/process suite | 25 tests passed on Windows with Node 20.19.0 |
| Live estate verification | 219 capabilities, 6,920 entries; expanded durable root absent |
| Live dependency resolution | 70 of 70 declared dependencies present; no external tool roots |
| Scenario/contract/provider views | Exercised execution-plan v1, v2 and v3 capsules |
| Real capability invocation | `resolve-sidefx-eligible-providers` returned canonical `NOT_OBSERVABLE` evidence for its undeclared-target fixture |
| Runtime parity | Same canonical outcome and trace as direct bootstrap execution; separately generated observation timestamps retained |
| Receipt parity | CLI and SDK returned the identical retained receipt |
| Focused fixture evaluation | Provider-resolution capsule fixture proof passed through the runtime adapter |
| Package | npm archive created and installed into an isolated local prefix; generated Windows `sfx.cmd` ran version, live discovery and catalog discovery |

The integration run performed read-only provider resolution and its focused
fixtures. It did not invoke external providers or perform managed admission or
publication. Unit/process tests use explicit test doubles and are not evidence
of managed capability conformance.

Linux/macOS execution is configured in the CI matrix and has not been observed
in this local run. Provider catalog examples are illustrative. The original
global-prefix package smoke command was rejected by automatic command policy;
the check completed using a local workspace prefix instead.

## Repository-name and review follow-up

The working copy is now at `C:\lab\repos\sidefx-cli`, with local Git branch
`main` and origin `https://github.com/BPMSoftwareSolutions/sidefx-cli.git`.
The package is `sidefx-cli@0.1.0`; its executable remains `sfx`.

| Check | Observed result |
| --- | --- |
| Workspace transfer | All 54 copied files matched SHA-256 digests before subsequent documentation edits |
| Tests at the new path | All 25 unit/process tests passed on Windows with Node 20.19.0 |
| Preserved implementation | All 12 files under `src/` and `bin/` matched the original working copy |
| Renamed package | New archive installed into `.sidefx/renamed-package-smoke`; `sfx.cmd --version` returned `sfx 0.1.0` |
| Installed CLI | `sfx find interlock` returned the real estate's `interlock-agent-operation` capsule |
| Installed SDK | Importing `createSidefx` from `sidefx-cli` succeeded |
| Review references | All 18 relative source/document references resolved; referenced line numbers exist |

The initial transfer used a verified copy after Windows blocked renaming the
open workspace. The user subsequently pushed the repository and removed the
original folder. Follow-up verification confirmed that
`C:\lab\repos\sidefx-verbs` no longer exists and that local `main` and the
remote `refs/heads/main` both point to
`f1087ff3b938ca9db2a250ebd610a99a80db39c1`. The working tree was clean before
this documentation update. Continue development in `C:\lab\repos\sidefx-cli`.

## Provider-neutral command model

The subsequent command-model change adds object-first CLI/SDK requests and v2
routes while retaining existing verb-first mechanics and v1 routes. This change
updates the earlier interface implementation; the preservation measurements above
describe the repository-name transfer, not the later grammar work.

| Check | Observed result |
| --- | --- |
| Portable unit/process suite | All 31 tests passed on Windows with Node 20.19.0 |
| Neutral grammar | Known and previously unknown provider namespaces use the same commands; vendor commands, vendor flags and unsupported object/operation pairs are rejected |
| Catalog scope | Search covers all configured catalogs; even the namespace `estate` remains provider data |
| Managed operation boundaries | Provider lifecycle and profile requests require bindings; provider evaluation never becomes fixture evaluation; canonical input and native holding results are retained |
| Route isolation | v2 object/operation keys, exact-before-wildcard matching, v1/v2 separation, duplicate rejection, stale pins and input snapshots verified |
| Live integration | Passed against 219 estate capabilities using object-first discovery, invocation, observation and fixture evaluation; direct runtime parity and CLI/SDK receipt parity retained |
| Installed command | Packed and installed into `.sidefx/object-command-smoke`; the generated `sfx.cmd` ran generic provider search with a namespace data filter |

The new grammar does not supply live provider credentials, evaluator mechanics,
admission decisions or automatic profile-based provider resolution. The live test
invoked only the existing read-only estate resolver and its focused fixtures.

## Entity-neutrality reinforcement

Review of the provider-neutral baseline (`941b205`) found that canonical comparison
could reclassify a capability ID as an execution receipt ID, SDK commands silently
accepted undeclared fields, and v2 routes accepted undeclared configuration. The
new regression suite reproduced those three gaps before the fixes.

| Check | Observed result |
| --- | --- |
| Portable unit/process suite | All 37 tests passed, including six entity-neutrality tests now included in `npm test` and the existing CI command |
| Typed identity collision | Capability/capsule reads stay on capsule authority when the same ID also names an execution receipt; unavailable authority does not fall back across entity kinds |
| Shared command envelope | Undeclared SDK control fields rejected before runtime calls; the same fields inside canonical input are forwarded unchanged |
| Entity relationships | Exact scenario, input, event and outcome identities retained across unrelated domains; an unobserved scenario remains unavailable |
| Binding scope | Provider, capability, capsule and profile evaluation routes remain isolated by object and operation; v2 documents and entries reject undeclared fields |
| Receipt context | Typed invocation and fixture evidence retain their declared object and operation |
| Live integration | Passed against 219 estate capabilities after dispatch/context changes; canonical runtime and CLI/SDK receipt parity retained |
| V3 identity roles | After the projection correction, all 87 bindings in live `admit-capability-authority` matched their native mechanic/profile/provider identity fields; terminal role labels verified |

The broader law is recorded in the command model, README, architecture, intent
correction and root `AGENTS.md`. The npm package includes those contribution rules.
V3 callers must read mechanic/profile identities from `mechanicId` and
`providerProfileId`; absent actual provider identities are now `null`.

The enforcement observed here covers this CLI and its shared SDK. Inputs, events
and outcomes retain their existing capsule/scenario representation; standalone
command families and conformance of other SideFX delivery surfaces are not claimed.
