# Explicit command delivery

A project can bind a command surface to an independently installed process. This
is a configured execution boundary, with no implicit estate fallback or admission
claim. The CLI contains only the transport; the provider selects authority and
interprets input. Existing bootstrap surfaces remain available through the
shipped command mapping.

`sfx-project.v1` accepts an optional `deliveries` object. Each entry declares
`type: "process"`, `command`, an array of literal `args`, and `cwd`. The working
directory and commands containing a path separator resolve relative to the
configuration file. Bare executable names resolve through PATH. Arguments are
passed verbatim without a shell; relative arguments resolve in the declared cwd.

```json
{
  "configurationType": "sfx-project.v1",
  "commands": "commands.json",
  "deliveries": {
    "selected-runtime": {
      "type": "process",
      "command": "node",
      "args": ["runtime.mjs"],
      "cwd": "../runtime-provider"
    }
  }
}
```

In `sfx-command-mapping.v1`, a process surface declares `delivery` and
`operations`, while an estate surface declares `capabilityId` and its request
contract. These bindings are mutually exclusive. A process surface cannot use
field templates or repository-root injection: it receives the complete validated
request. An operation's `wraps.surface` and `wraps.operation` select the explicit
binding and operation, just as for bootstrap delivery.

```json
{
  "mappingType": "sfx-command-mapping.v1",
  "surfaces": {
    "selected": { "delivery": "selected-runtime", "operations": ["invoke"] }
  },
  "identities": {},
  "commands": {
    "capability": {
      "invoke": {
        "min": 1, "max": 1, "input": true,
        "wraps": { "surface": "selected", "operation": "invoke" }
      }
    }
  }
}
```

CLI and SDK share the `sfx-command-delivery.v1` stdin protocol:

```json
{
  "deliveryType": "sfx-command-delivery.v1",
  "operation": "invoke",
  "request": {
    "object": "capability",
    "verb": "invoke",
    "subject": "selected-identity",
    "input": { "contractId": "domain-owned.v1" }
  }
}
```

The envelope is closed to those three fields. `operation` is the mapped surface
operation; `request` is the unchanged canonical command, closed to `object`,
`verb`, `subject`, `other`, `query`, `scenario`, `as`, `input`, and `namespace`.
Optional undefined fields are omitted by JSON serialization. No identity-based
dispatch or domain contract translation occurs in the CLI. The provider must
validate its supported entity/operation and canonical authority.

Stdout must contain one canonical result object. Outer `disposition: terminated`
or `completed` means delivery completed; `outcome` passes unchanged to the caller.
Domain holds and rejections inside that outcome keep their meaning and exit 0.
Other outer dispositions fail with exit 4, retaining the native result and
`errorCode`. Missing bindings also exit 4. Stderr is diagnostic only. The same
timeout, interrupt handling, JSON integrity checks and stream limits apply to
both process and bootstrap delivery.

SDK usage is `createSidefx(await loadConfiguration(configFile)).execute(request)`.
The same mapping and delivery bindings apply from both interfaces.

## Database execution acceptance

The separately installed [sfx-embody](https://github.com/BPMSoftwareSolutions/sfx-embody)
project binds `capability invoke` to its candidate SQL-to-memory provider. From
that project, the exercised command is:

```powershell
sfx capability invoke resolve-sidefx-eligible-providers --input '@examples/provider-resolution.request.json' --json
```

It returned `PROVIDERS_RESOLVED`, two considered bindings and one eligible
provider, exit 0. The provider reads the selected capability and its normalized
root Scenario from SQL, compiles and loads the selected native body in memory,
and executes the supplied input through the Scenario Kernel. It does not use the
estate materialization route. Its evidence states `CANDIDATE_PHYSICAL_PROVIDER`
and `NOT_REQUESTED` for managed admission. This integration establishes selected
capability invocation, not universal provider coverage or database capsulization.

The provider's `scripts/verify-sfx-invocation.ps1` retains native commands, exits
and streams. CLI regression coverage also checks identical CLI/SDK envelopes,
colliding typed identities, Unicode input, missing bindings, domain holds and
native failures. Bootstrap delivery remains covered by the existing suite.
