# Bounded HTTP provider

This independent package supplies the mechanics for `evaluate-http-provider`: request validation,
credential reference resolution, one HTTP exchange, JSON parsing, declared field
checks and redaction. The CLI invokes it through `sfx-process-runtime.v1` over
stdin/stdout. It imports no CLI or Agentic Harness implementation.

Harness's `authority/capabilities/evaluate-http-provider/capability.authority.json`
owns the active capability's meaning, input/event/outcome identities, contract
vocabulary and required provider profile. Its runtime connection passes that exact
file as the worker's second argument, after the operation-descriptor file. The
worker validates the authority digest before executing. The bundled `capability.json`
remains an example authority for explicitly configured standalone use.
The selected Node
implementation uses built-in HTTP, JSON and operating-system mechanics. Python,
.NET, JVM, Go and services remain eligible implementations of the same contract;
none is automatically qualified by being listed.

The configured capability has no `.sfxcap` and makes no capsule admission
or managed publication claim. Local digests detect changes; they are not
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

Harness connections use `module:@sidefx/http-provider` and its `transport` and
`credentials` exports. This package is installed separately in the estate and
is not a CLI dependency or export. Every selected artifact is digest-bound.
The operation and capability files are owned by Harness. The provider constructs
its own domain input from the shared protocol's command context; native input
invocation is also supported. The CLI knows neither this contract nor these effects.

After reviewing changes to declared artifacts or configuration, update their local
digests from the repository root:

```text
node scripts/bind-runtime.mjs C:\lab\repos\agentic-harness\authority\provider-connections\bounded-http.runtime.json
```

If the capability authority changes, update its entity operation binding's `authorityDigest` to the new
artifact digest as part of that review. Rebinding does not qualify new mechanics;
run the applicable provider/CLI tests. The shared transport tests cover multiple
provider namespaces, GET and POST, failed preconditions, denial, redirects,
invalid JSON, failed field checks, response bounds, timeout, redaction, binding
drift and receipt failure through the actual CLI.

The current local build is `@sidefx/http-provider@0.1.1`. It is packed and installed
independently of `sidefx-cli`. The development installation in Harness uses the
local archive and leaves its bootstrap dependency and lockfile unchanged. This
provider is not published to a registry; reinstall it after a clean dependency
reset. Provider packaging and delivery do not change the generic CLI protocol.
