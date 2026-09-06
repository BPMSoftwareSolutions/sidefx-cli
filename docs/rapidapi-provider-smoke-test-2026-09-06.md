# RapidAPI provider smoke test — 2026-09-06

## Harness retry after the subscription update

The user clarified that the selected provider and consuming capability must come
from `agentic-harness`. The earlier successful HTTP observations below used the
separate local provider package and do not establish execution through Harness.

At 21:54 UTC, with the working directory set to `C:\lab\repos\agentic-harness`
and no local CLI project configuration loaded, the installed command was retried:

```powershell
sfx provider evaluate rapidapi/yahoo-finance166 --estate C:\lab\repos\agentic-harness --json
```

It exited **3** with **`CAPABILITY_ROUTE_REQUIRED`**, before any provider request.
The subscription was therefore **not retested**. The exact invocation and native
error are retained in [the retry observation](evidence/provider-cli-harness-retry-2026-09-06.json).

After fetching, Harness `main` and `origin/main` both resolved to
`3323d82d5255e3d78fd76c312b7f1d416620caa0`. An estate inspection through `sfx`
returned `CAPSULE_NOT_FOUND` for `observe-remote-api-operation-exchange`.
Its separate provisioned token, the RapidAPI candidate compiler token, and the GET
transport revision all have placement receipts declaring
`PROVISIONED_EXECUTABLE_WITH_OPEN_SLOTS`. Harness provider execution remains
incomplete; the local package does not close those mechanics.

## User-selected operations

The user's subsequent request supplied different provider products and operations.
The active descriptors now reproduce those exact hosts, paths and parameter values.
The provided API key matched the existing Windows user credential reference; no
credential was copied into the repository. The final tests used the actual installed
`sfx` command, with one request per invocation, a 12-second timeout, a 1 MiB response
bound, no retries and no redirects.

| Command | Operation and input | Observed result |
| --- | --- | --- |
| `sfx provider evaluate rapidapi/realty-us --json` | `/agents/v2/listings?fulfillmentId=3155600` | HTTP 200, valid JSON; native `status: true`, `message: Successful` |
| `sfx provider evaluate rapidapi/yahoo-finance15 --json` | `/api/v1/markets/news?ticker=AAPL%2CTSLA` | HTTP 200, valid JSON with `meta` and `body` |
| `sfx provider evaluate rapidapi/yahoo-finance166 --json` | `/api/news/list?snippetCount=500&region=US` | HTTP 200, valid JSON; native `status: OK` |
| `sfx provider evaluate rapidapi/yahoo-finance-real-time1 --json` | `/stock/get-options?symbol=WOOF&lang=en-US&region=US` | HTTP 403, `You are not subscribed to this API.` |

The corresponding executions are `exec-cd5a6ba7-6874-4924-9c96-86a3d38b6073`,
`exec-0f28681f-ee0e-46cd-94ff-75b721f5ad6d`,
`exec-4e8921b0-a24d-4d16-925a-2540d5606e8a` and
`exec-e23cdce6-7f7d-4fd8-93c7-e12a1acf7a80`.
All four receipts were read back with `sfx execution observe`. Their
[verification summary](evidence/provider-cli-selected-2026-09-06.json) retains exact
request URLs, binding identities, native status, timing, check coverage and receipt
digests, without response bodies or credential values.

These operation defaults check expected HTTP status and JSON syntax. Native success
fields are retained as observations; full response contracts and business equivalence
are not claimed. The original Yahoo Finance166 `stock-price` operation remains
available through `--input` with `operation: stock-price` and retains its three field
checks. The earlier candidates and results below are historical; their subscription
denials do not describe the newly selected provider products.

## Initial CLI repair verification

**CLI execution repaired and verified at 21:32 UTC.** The installed `sfx`
command now executes the separately packaged local HTTP evaluation capability.
The following actual CLI runs each performed one request and retained a receipt:

| Command | Result | Execution |
| --- | --- | --- |
| `sfx provider evaluate rapidapi/yahoo-finance166 --json` | `PASSED`, HTTP 200; symbol matches AAPL, currency is a string, price is numeric | `exec-6404c777-defe-4094-8a8b-dc9a9fafe8a0` |
| `sfx provider evaluate rapidapi/yh-finance --json` | `HTTP_REJECTED`, HTTP 403; not subscribed | `exec-87c7d9b6-a5ec-4ca6-a8d0-7cc63329353f` |
| `sfx provider evaluate rapidapi/seeking-alpha --json` | `HTTP_REJECTED`, HTTP 403; not subscribed | `exec-d378f2b4-fdc3-460b-b07e-a8ebbced622b` |
| `sfx provider evaluate rapidapi/realty-in-us --json` | `HTTP_REJECTED`, HTTP 403; not subscribed | `exec-6617fcdf-0c16-4980-a055-4acf7bd11476` |

These runs used `sfx.config.json` from the `sidefx-cli` working directory. The
key was resolved inside the provider from the Windows user environment. GET,
timeout, size bounds, response checks and credential redaction belong to the
provider package. The CLI retained the exact capability/runtime binding and
returned result. Redacted native JSON is included in the new execution receipts.
Use `sfx execution observe <execution-id> --json` to inspect them locally.

This is a locally installed capability, not an admitted Harness capsule. It
does not change the Harness transport or close its provisional token slots.
`PASSED` covers the selected operation's declared checks, not complete response
conformance, data freshness, business equivalence or provider interchangeability.
Subscriptions were not changed; the three denials remain actionable account results.

## Earlier attempts, before the repair

**Initial CLI acceptance was BLOCKED.** The direct requests below did not fulfill the
requested test through `sfx`. At 21:15 UTC, the actual CLI was exercised for all
four provider identities. Every invocation exited 3 with
`CAPABILITY_ROUTE_REQUIRED`; no provider request executed. The exact commands
and native errors are retained locally in
`.sidefx/provider-smoke/2026-09-06-cli-boundary.observation.json`.

At 21:00 UTC, four direct authenticated GET requests produced the following observations:

| Provider | Request | HTTP | Observation |
| --- | --- | --- | --- |
| Yahoo Finance166 | `/api/stock/get-price?region=US&symbol=AAPL` | 200 | Valid JSON, top-level `quoteSummary`, 1,673 bytes; 860 ms |
| YH Finance | `/market/v2/get-quotes?region=US&symbols=AAPL` | 403 | `You are not subscribed to this API.` |
| Seeking Alpha | `/symbols/get-top-holdings?symbol=SPY` | 403 | `You are not subscribed to this API.` |
| Realty in US | `/agents/v2/list?postal_code=10001&offset=0&limit=1` | 403 | `You are not subscribed to this API.` |

Each provider received one request, with no retries or redirects, a 12-second timeout, and a 256 KiB response limit. The key came from the Windows user environment variable `RAPID_API_KEY`. No credential value or raw response body was retained. No subscriptions were changed.

These are direct diagnostic observations, not managed capability execution, provider admission, response-contract conformance, or provider interchangeability proof. HTTP 200 and parseable JSON do not establish correctness or freshness of the price payload.

## Original estate boundary

Before the repair, the generic command was exercised:

```powershell
node bin/sfx.mjs provider evaluate rapidapi/yahoo-finance166 --estate C:\lab\repos\agentic-harness --json
```

It returned `CAPABILITY_ROUTE_REQUIRED`: no evaluator capability is bound. Inspecting the current `observe-governed-http-exchange` capsule through the CLI confirmed that its request schema permits only `POST`; these requests require `GET`.

- Estate manifest: `sha256:c444ce69a98589e28003d7d2bace5abc51fce21d0d05458177e8d515e5d09937`
- HTTP capsule: `sha256:78cb3350a9171bada77f1df525ce35b8c1fb189ebd4f643400bca5f895afb8ef`
- Local redacted observations: `.sidefx/provider-smoke/2026-09-06T210046Z.observation.json` (ignored local diagnostic data)

The diagnostic used a disposable generic HTTP client outside all repositories. It adds no CLI command, runtime dependency, route, provider admission, or managed authority. The temporary implementation was removed after verifying the retained observations.

Managed Harness execution still requires closure of its own evaluator and transport
capabilities. The local capability repair above supplies the executable CLI path
without representing that separate managed work as complete.
