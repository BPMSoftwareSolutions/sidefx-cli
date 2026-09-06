# Bounded HTTP provider

This independent package owns `evaluate-http-provider`: request admission,
credential reference resolution, one HTTP exchange, JSON parsing, declared field
checks and redaction. The CLI invokes it through `sfx-process-runtime.v1` over
stdin/stdout. It imports no CLI or Agentic Harness implementation.

`capability.json` owns the capability's meaning, input/event/outcome identities,
contract vocabulary and required provider profile. `runtime.json` binds the
physical process and exact implementation/configuration bytes. The selected Node
implementation uses built-in HTTP, JSON and operating-system mechanics. Python,
.NET, JVM, Go and services remain eligible implementations of the same contract;
none is automatically qualified by being listed.

This is a locally installed capability. It has no `.sfxcap`, no Harness admission,
and no managed publication claim. Local digests detect changes; they are not
signatures or enterprise admission. `sfx capsule` never represents it as a capsule.

## Evaluation contract

Input is `sfx-semantic-command.v1` with a `provider evaluate` command. Its subject
selects a configured provider. Optional `input.operation` chooses one declared
operation; `input.parameters` overrides declared string parameters. Unknown
fields, providers, operations and parameter names are rejected before credentials
or network activity. Endpoint URLs, headers, credentials and effects cannot be
overridden through command input.

Each operation declares GET or POST, an HTTPS origin/path, public headers, an
optional environment credential reference, parameters, allowed success statuses,
and JSON-pointer response checks. Plain HTTP requires an explicit loopback-only
configuration and a literal loopback IP. GET rejects bodies. POST sends the exact
JSON serialization of its descriptor-owned body; specify its content type in the
descriptor. There are no retries or redirect handling paths.

Credential scope `process` uses the process environment. Scope `user` uses the
Windows current-user environment registry through a fixed `reg.exe` operation.
Credential bytes stay inside the provider process and HTTP header. Missing
credentials return `CREDENTIAL_UNAVAILABLE` with zero requests. Neither key
possession nor HTTP success implies subscription, quota or billing authority.

Response checks establish only their declared field types and equalities. `PASSED`
means the selected status, JSON syntax and those checks passed for one response.
HTTP denials retain their status and redacted response. No freshness, complete
response schema, business equivalence, provider replacement or admission is implied.

The response envelope is `sfx-runtime-response.v1`, with exact capability identity
and either `result` or a credential-free error. The caller creates its delivery
receipt before invocation. The provider redacts the credential and its URL/base64
representations from returned strings and applies secret-field hygiene. Arbitrary
third-party sensitive content is outside that redaction claim.

## Changing the local binding

After reviewing changes to declared artifacts or configuration, update their local
digests from the repository root:

```text
node scripts/bind-runtime.mjs packages/http-provider/runtime.json
```

If `capability.json` changes, update the route's `authorityDigest` to its new
artifact digest as part of that review. Rebinding does not qualify new mechanics;
run the applicable provider/CLI tests. The shared transport tests cover multiple
provider namespaces, GET and POST, failed preconditions, denial, redirects,
invalid JSON, failed field checks, response bounds, timeout, redaction, binding
drift and receipt failure through the actual CLI.
