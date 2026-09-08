# Estate delivery verification — 2026-09-08

The CLI reaches the estate through its installed `sda-bootstrap` executable.
Command meaning and canonical input stay behind the declared estate capability
boundary. No provider implementation or capsule reader was added to the CLI.

## Repairs

The Harness root bootstrap manifest declared two external dependency identities
as `node_modules/sda-bootstrap/...`, whereas the capsules and installed resolver
use `package:sda-bootstrap/...`. The two manifest binding references were
reconciled with the existing capsule identities. Physical lookup still uses the
declared platform root and projected root. No capsule, executable, or installed
bootstrap dependency pin was changed.

The delivery transport formerly buffered the full bootstrap result and rejected
it at 32 MiB. The bootstrap repeats execution history outside the terminal
outcome. The transport now validates the entire JSON stream while excluding only
root `executions`, `observations`, `nestedExecutions`, and `nestedObservations`
from its assembled envelope. Every field inside `outcome`, including fields with
those same names, remains intact. The assembled result remains bounded to 32 MiB;
the complete transport stream is bounded to 512 MiB. Failures keep their native
error code and terminal outcome. Full kernel history remains available through
the bootstrap's native invocation output.

The estate execution contract also requires a caller-authorized disposable
parent. A surface may declare `disposableParentRootRefField`; the CLI supplies the
OS temporary-directory URI in that field. This is process context, separate from
the capability's canonical input. It introduces no entity-specific command,
provider selection, or business behavior.

## Verification

`npm test` runs the transport and entity-neutrality regressions. They cover
40 MiB of repeated execution history, intact domain values across byte
boundaries, malformed/truncated JSON including ignored history, result and wire
limits, stderr/exit handling, timeout, canonical input preservation, disposable
parent context, typed identities, and unavailable operations.

Native `sfx capability list --estate C:/lab/repos/agentic-harness --json --timeout
600000` returned `DELIVERED` → `LISTED`, 219 capabilities, and zero findings.
Its complete pretty-printed terminal result was 31,186,578 bytes. The longer
timeout was explicit: this measurement does not establish that the current
estate's exhaustive verification meets the CLI's default 120-second timeout.

Four current `resolve-sidefx-eligible-providers` fixture inputs were compared
between direct capsule invocation and the database-derived Node embodiment.
All complete domain outcomes were deeply equal; all 28 outcome assertions
passed, and repeated embodiment execution was deterministic. Execution IDs and
kernel timestamps are transport observation metadata, outside those domain
outcomes. These fixtures exercise provider-resolution decisions; they do not
perform a live supplier request or prove general embodiment equivalence.

The current finance token
`resolve-equity-market-price-evidence-66649dedccad3e0f.sfxcap` remains
`PROVISIONED_EXECUTABLE_WITH_OPEN_SLOTS`: exact invocation returns
`PROVIDER_REQUIRED`, four open event-mechanic slots, and no bound provider.
Database verification passed, and the selected managed catalog does not contain
that finance capability. Provisioning, managed admission, and database ingestion
are separate states; this repair does not promote a scaffold by labeling it
executable finance logic.

## Remaining native invocation blocker

With the binding identities and disposable context repaired, native
`sfx capability invoke resolve-sidefx-eligible-providers --estate
C:/lab/repos/agentic-harness --input @provider-request.json --json --timeout
600000` advanced to file materialization and exited 4 with:

```text
CONTRACT_ADMISSION_FAILED: 'authorized-file-batch-materialization-request.v1'
data/entries must NOT have more than 4096 items
```

`prepare-execution-materialization.v2` constructs one batch from the entire
estate and its runtime aliases before selecting the requested capability.
That declared batch has 4,304 distinct targets: 208 above the admitted limit.
The same contract also bounds the authorized plan's operations to 4,096.
Full CLI invocation is therefore **BLOCKED**, not proven by the separate direct
bootstrap/embodiment comparisons above.

The next managed repair belongs to `operate-capsule-estate`: materialize a
proven necessary closure or compose bounded batches with explicit failure and
release handling. Raising a limit or replacing the estate invocation with a
local client would not establish that closure. The regression must exercise a
real estate above the boundary, the exact CLI input, complete outcome parity,
and rejection cleanup.

Harness [repository law](../../agentic-harness/CLAUDE.md) requires: “A shared or
repeated defect goes back through the conveyor as **its own capability change
plus a regression fixture**.” No capsule, generated port binding, or admitted
contract was patched to route around this finding. A managed capability revision
and the RapidAPI admission path remain unfinished.
