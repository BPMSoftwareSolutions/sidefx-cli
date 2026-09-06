# SideFX CLI responsibility and runtime review

Reviewed September 6, 2026. Repository: [BPMSoftwareSolutions/sidefx-cli](https://github.com/BPMSoftwareSolutions/sidefx-cli).

This review describes the implementation recorded in commit `f1087ff3`. The
subsequent [provider-neutral command model](command-model.md) adds object-first
grammar, object-scoped routes and catalog search across namespaces. Later fixes
are noted against individual findings. Profile-based provider selection remains
an explicit integration requirement.

## Decision

Keep the working Node terminal as a candidate interface provider. Do not rewrite
it in Python for language symmetry. The implementation is JavaScript (`.mjs`),
not TypeScript, and its first language does not own any capability.

The implementation contains no embedding, taxonomy-inference, model-evaluation,
statistical-analysis or live provider-assimilation engine. Those are missing
capability implementations or explicit delegation points, not concealed Node
implementations waiting to be translated. Python would materially improve several
of those future provider families. That conclusion is an ecosystem-fit assessment,
not a benchmark or a provider-admission result.

The principal current coupling is that every real execution uses a local Node
bootstrap and every capability inspection is interpreted through Node execution
plan formats. Catalog matching and the local evidence dialect also reside in the
SDK. These boundaries need explicit profiles and shared authority before they
become platform-wide behavior.

## Findings, in priority order

### F1 — P1: execution does not resolve a capability profile to eligible providers

[`EstateRuntime.request`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/runtime.mjs#L17) constructs
`node_modules/sda-bootstrap/src/capsule-manager.mjs` and forks a Node worker.
[`Sidefx.delegate`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/index.mjs#L54) selects an exact capability ID from
`--via` or a route file; [`resolveRoute`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/routes.mjs#L7) supports exact and
wildcard subject matching plus a capsule digest. Neither selects from provider
families using a required profile, environment constraints and conformance evidence.
The default `resolve` operation checks capsule/dependency closure, as its output
correctly states.

**Consequence:** a conformant Python worker, HTTP service or other runtime cannot
be selected merely by supplying its profile. The SDK's `options.runtime` injection
point is useful, but the CLI cannot select it and the SDK still expects the
bootstrap's capsule-shaped inspection response. Existing capsules may themselves
delegate effects; this review does not claim the complete estate is Node-only.

**Required boundary:** a managed capability/provider resolver returning an exact
invocation plan, followed by an admitted execution driver. Retain `EstateRuntime`
as the Node bootstrap driver candidate. Add other drivers only for real admitted
providers. The CLI should carry the selected plan, not rank languages itself.

### F2 — P1: representation interpretation is also an execution prerequisite

[`projectCapability`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/projection.mjs#L21) selects
`runtimeBindings[0]`, understands exactly three execution-plan versions, and
joins v3 cells to feature tags. The [worker](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/runtime-worker.mjs#L29) imports
Gherkin through the bootstrap installation. [`invoke`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/index.mjs#L40)
calls `inspectCapability`, which performs that full projection before invoking.

**Consequence:** a valid executable capsule with another representation or runtime
binding can fail before execution because the terminal cannot construct its
display. This is a stronger coupling than choosing Node to print a view.

**Required boundary:** a shared `capability-representation` profile with canonical
identity, scenario, contract, blueprint and binding records. Keep Node's proven
extractor as a candidate deterministic provider. Let invocation require exact
identity and execution admission; make richer representation a separate request.
Terminal layout and text formatting remain local interface mechanics.

### F3 — P2: provider discovery and matching policy are embedded in the SDK

[`ProviderCatalog.records/search`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/catalog.mjs#L16) validates a local
descriptor vocabulary and implements AND-of-words substring matching over the
entire serialized descriptor. [`providers`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/index.mjs#L90) matches
candidate capability IDs by exact array membership. `find` delegates an estate
identity substring query to the bootstrap. There is no semantic retrieval,
ranking, embedding, taxonomy inference or conformance evaluation here.

**Consequence:** terms in metadata, evidence labels or field names can match just
like provider descriptions, and search semantics cannot be exchanged via a
retrieval provider. These simple searches remain useful as explicit local filters.

**Required boundary:** use a managed discovery/query profile for platform search,
with declared searchable fields, namespace scope, frozen source identity, ranking
policy and evidence. Keep local-file loading and reference registration as local
mechanics. A supplied `OBSERVED` label remains a claim; it is not source admission.
Python-assisted retrieval should be a new provider for this boundary, not an
unmanaged library inserted into `search()`.

### F4 — P2: local receipt rules need a shared evidence profile before reuse

[`ReceiptStore`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/receipts.mjs#L9) owns its receipt schema and
`RUNNING -> RETURNED | DELIVERY_FAILED` delivery states.
[`canonical/digest/redact`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/data.mjs#L18) define key ordering, JSON
serialization and a secret-field-name policy. This is explicitly local testimony,
which is an appropriate scope for the present journal.

**Consequence:** another surface or Python provider must not invent its own
interpretation of these bytes and assume digest parity. Number serialization,
Unicode ordering, redaction and missing/null treatment need common vectors.
`RETURNED` is delivery state, never domain success, and local digests are not
signed or managed evidence.

**Required boundary:** admit a canonical evidence envelope, canonicalization
profile, retention/redaction policy and evidence-store provider when receipts
become shared estate evidence. Preserve the local journal and atomic file writes;
do not turn every filesystem helper into a remote capability call.

### F5 — P2: a v3 mechanic identity is labeled as a provider capability identity

The [v3 projection](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/projection.mjs#L61) assigns
`binding.mechanicId` to `providerCapabilityId`, while separately retaining
`providerProfileId` as `provider`. These are different roles in the requested
resolution hierarchy. The native record is preserved, which allows correction.

**Required boundary:** the representation profile must expose mechanic ID,
required profile, selected provider ID/profile, runtime, binding digest and
eligibility evidence as distinct fields. A mechanic name or a Node prefix cannot
establish a provider's eligibility. This mapping needs correction when the shared
representation contract is introduced; the review leaves source behavior intact.

**Entity-neutrality follow-up:** the local v3 projection now exposes `mechanicId`,
`providerProfileId` and `providerCapabilityId` separately, retains native bindings,
and keeps absent provider identities `null`. Terminal summaries label those roles.
This corrects the reported identity conflation; shared representation-provider
admission and general profile-based resolution remain separate work.

### F6 — P2: fixture proof is not semantic/model evaluation

[`evaluate`](https://github.com/BPMSoftwareSolutions/sidefx-cli/blob/f1087ff3b938ca9db2a250ebd610a99a80db39c1/src/index.mjs#L102) without a route calls
`proveDirectExecution` and labels its receipt `CAPSULE_FIXTURE_PROOF`. That labeling
is correct. `assimilate`, `author`, `install`, `govern` and `publish` require a bound
capability; no corresponding business implementation is hidden in the terminal.

Preserve fixture evaluation as a deterministic proof profile. Introduce separate
profiles for API behavior, semantic fitness, model quality, and statistical
comparisons. Preserve structural comparison as a structural view. A passing test
or a zero structural diff cannot satisfy those distinct responsibilities.

### F7 — P2: the candidate interface needs a supported runtime baseline

[`package.json`](../package.json) permits Node 20 and the [CI matrix](../.github/workflows/test.yml)
tests Node 20/22. Node's current release table marks 20 EOL and 22/24 LTS. Qualify
the existing provider on an organizationally supported LTS baseline and record
that in its provider profile; a language rewrite is unnecessary. This review
does not change the runtime floor or claim new runtime validation. [Node releases](https://nodejs.org/en/about/previous-releases).

## Classification rules and profile status

Every runtime source file and public command is accounted for below; small
helpers with the same responsibility share a row. Test doubles, tests and CI are
classified separately from product behavior. Composite workflows are split into
their mechanics, so provider assimilation is not assigned wholesale to one class.

Classes are **1 interface/terminal**, **2 deterministic generic platform**,
**3 AI/ML**, **4 retrieval/search**, **5 data/statistical**, and **6 external-provider**.

Profile names without an `sda-` prefix below are **proposed requirement labels**,
not new canonical capability identities. The `sda-*` names are existing design
recommendations in the [SDA language strategy](../../scenario-driven-architecture/docs/architecture-at-scale-and-enterprise-evolution.md),
not evidence that this estate admits each provider. Runtime families listed are
eligible to offer candidates **only subject to the profile, contracts, exact
artifact/model version, constraints and current conformance evidence**. No Python
provider was admitted or benchmarked by this review.

N = Node; P = Python; G = Go; C = C#/.NET; J = JVM/Java; Rs = Rust/native.
The statistical language R is written out as `R statistics` below.
An HTTP/MCP endpoint or worker service is a delivery/provider family, not a
language. A remote service may use any qualifying runtime internally.

## 1. Interface and terminal mechanics

| Responsibility / current location | Required capability profile | Candidate runtime/provider families | Disposition and Python value |
| --- | --- | --- | --- |
| Executable entry, npm shim, version/help; `bin/sfx.mjs`, `package.json`, `cli.mjs` | `portable-terminal-host`: supported OS/runtime, stable command name | N; P/G/C/J terminal hosts | Keep N. Python offers no demonstrated improvement for the current shell. |
| Argument grammar, arity, option applicability, usage errors; `parseCommand`, `errors.mjs` | `terminal-command-carrier`: exact grammar, attributable rejection | N/P/G/C/J | Keep N; grammar belongs to a shared interface contract if other hosts are introduced. |
| Inline/file/stdin JSON acquisition and stdout/stderr delivery; `readInput`, `runCli` | `json-terminal-transport`: UTF-8, bounded carriers, stream separation | N/P/G/C/J | Keep N. File decoding utilities are class 2. |
| Human panels, scenario text, grouped binding counts, JSON output, control-character filtering; `render.mjs` | `terminal-representation`: preserves evidence labels and canonical identifiers | N/P/G/C/J | Keep N. Grouped display counts are not statistical analysis. |
| Broken pipe, process signals, diagnostic capture, IPC framing; `bin/sfx.mjs`, `runtime.mjs` | `bounded-interface-transport`: deadlines, cancellation testimony, no shell interpolation | N; equivalent process/HTTP/MCP clients in P/G/C/J | Keep N implementation. External-effect cancellation policy is class 6. |
| Environment/path options, SDK construction/injection; `Sidefx.constructor`, `createSidefx`, `runCli` | `interface-provider-configuration`: caller-chosen estate and evidence scope | N today; any host for the protocol | Preserve SDK seam; no requirement to clone the SDK into every language. |
| Verb dispatch and unchanged carrier forwarding; `Sidefx.execute/delegate` | `capability-command-projection`: command to canonical request, no business inference | N/P/G/C/J | Keep command mapping in N; profile/provider selection moves to class 2 authority. |
| Local reference add/remove/list and local receipt selection; `ProviderCatalog`, `ReceiptStore.list`, `observe/explain` | `local-operator-state`: local scope, idempotent reference updates, exact receipt IDs | N/P/G/C/J, local store providers | Keep local UX. Shared registries and estate evidence require separate providers. |
| Explain stored intent/result/evidence without generating new claims; `explainReceipt` | `execution-evidence-view`: source-bound fields and unknown-state preservation | N/P/G/C/J | Keep N rendering. No LLM currently participates. |
| HTTP/MCP/streaming interface delivery | `sda-http-webhook-gateway`, `sda-mcp-agent-interface`, `sda-realtime-interface` | N strong candidate; P/G/C/J endpoints also eligible | These are future CLI adapter options, not implemented servers or streaming UX in this package. |

## 2. Deterministic generic platform mechanics

| Responsibility / current location | Required capability profile | Candidate runtime/provider families | Disposition and Python value |
| --- | --- | --- | --- |
| Finite JSON validation, input snapshot and shape checks; `assertJson`, `invoke`, `requireValue` | `canonical-carrier-validation`: same accepted values across embodiments | N/P/G/C/J/Rs | Keep local checks; runtime owns domain admission. No Python-specific gain. |
| Canonical serialization, SHA-256, raw-byte digests; `data.mjs` | `canonical-evidence-bytes`: explicit number/string/key ordering and test vectors | N/P/G/C/J/Rs | Shared deterministic authority, reusable local implementations; no mandated Python port. |
| JSON reading, atomic writes, exclusive creation, IDs/timestamps; `data.mjs`, `receipts.mjs` | `bounded-local-artifact-store`: atomicity, permissions, failure evidence | N/P/G/C/J/Rs or storage provider | Keep working file mechanics; shared storage is a separately selected provider. |
| Secret-field filtering and receipt schema/state/integrity; `redact`, `ReceiptStore.save/read/execute` | `execution-delivery-evidence` plus `evidence-redaction-policy` | N/P/G/C/J or managed evidence service | Local testimony today; extract shared policy/contract, not arbitrary I/O helpers. |
| Exact/wildcard command route lookup, duplicate detection and stale pin refusal; `routes.mjs`, `invoke` | `pinned-command-binding`: exact matching, explicit precedence, immutable binding | N/P/G/C/J | Keep lookup mechanic. It does not supply provider eligibility or language selection. |
| Required-profile resolution and provider qualification/selection | `capability-provider-resolution`: admitted catalog snapshot, constraints, deterministic selection or hold | N/P/G/C/J control-plane providers; service resolver | Missing from this CLI. Resolve through managed authority, with no automatic Python preference. |
| Bootstrap driver selection and launch; `EstateRuntime.request`, `runtime-worker.mjs` | `resolved-execution-driver`: exact plan, artifact, target, deadline and evidence | Existing N bootstrap; qualified P/G/C/J/native/container/remote drivers | Make N one candidate. A wrapper alone is not Python capability admission. |
| Estate loading, digest/layout/dependency verification; worker calls existing bootstrap | `capsule-estate-integrity`, `estate-dependency-closure` | Current bootstrap; qualified language-neutral verifier/resolver providers | Already delegated physical work. Preserve exact contracts and existing authority. |
| Input/event/outcome execution and schema admission; worker `invokeCapability` | Profile selected by the invoked capability, plus generic execution protocol | Current N driver and whichever admitted effect providers its capsule binds | Already delegated; inspect each capability rather than attributing its meaning to Node. |
| Gherkin parsing and v1/v2/v3 capsule interpretation; worker, `projectCapability` | `sda-projection-toolchain` specialization `capability-representation` | Current N/Gherkin provider; P/G/C/J/Rs parsers/projectors with parity | Shared managed representation candidate (F2). No demonstrated need to rewrite the parser in Python. |
| Scenario selection, contracts, blueprint/feature exposure; `revealCapability` | `capability-representation`: source digests, complete geometry, explicit unavailable states | N/P/G/C/J or representation service | Move interpretation into the shared profile; retain display selection/layout in interface. |
| Structural JSON-pointer diff; `structuralDiff`, `compare` | `structural-json-comparison`: path escaping, array/order semantics, provenance | N/P/G/C/J/Rs | Keep local helper at its declared scope; shared comparison profile if other surfaces need it. No semantic inference. |
| Capsule fixture execution; worker `proveDirectExecution`, `evaluate` | `capability-conformance-proof`: exact fixtures, bounded effects, proof scope | Existing bootstrap; provider-specific conformance runners in N/P/G/C/J | Keep fixture proof delegated. Python is useful only for different proof/evaluation workloads. |
| Tests, protocol doubles, live integration, package/OS matrix | `interface-provider-conformance`: transport, parity, packaging and regression evidence | Current Node test runner and npm; any equivalent CI host | Existing tests validate the candidate interface, not every capability's provider eligibility. |

## 3. AI/ML mechanics

All rows below are absent from the terminal implementation. Generic `--via`
delegation is available, but it does not supply the listed implementations.

| Responsibility | Required capability profile | Candidate runtime/provider families | Python assessment |
| --- | --- | --- | --- |
| Semantic API description interpretation and mapping proposals | `sda-document-intelligence-worker` + `sda-ai-inference-worker`: source spans, schema-bound proposals, abstention | P model workers; N inference/remote clients; C/J/Rs inference runtimes; hosted models | Material for document/model tooling; keep deterministic parsing and final admission separate. |
| Taxonomy inference, operation classification and capability clustering | `capability-taxonomy-proposal`: versioned ontology, known labels, confidence calibration, reviewer disposition | P NLP/clustering providers; hosted models; N/ONNX candidates; human review | Material for embeddings and clustering experiments, not automatic identity/admission creation. |
| Embedding generation | `embedding-provider`: pinned model/tokenizer, dimensions, normalization, batch/resource limits | P CPU/GPU workers; N/ONNX; native inference; hosted embedding APIs | Material for local models, batching and tuning. No inherent advantage when merely calling the same hosted endpoint. |
| Semantic/provider fitness judgment | `provider-semantic-evaluation`: versioned rubric, evidence citations, uncertainty and disagreement | P evaluation workers; hosted evaluators; N/C/J model clients; human adjudication | Material when a corpus, model and evaluation pipeline are involved. Boolean gates remain deterministic. |
| ML/LLM evaluation and experiment control | `sda-model-evaluation-worker`: frozen data/splits, metrics, seeds, versions, independent reference judgments | P scientific/model-evaluation workers; external evaluation services; N/C/J clients to admitted services | Material for model testing and regression evaluation. Not implemented by `sfx evaluate` fixture mode. |

## 4. Retrieval and search mechanics

| Responsibility / state | Required capability profile | Candidate runtime/provider families | Disposition and Python value |
| --- | --- | --- | --- |
| Estate ID substring filtering; `find` / `search estate`, delegated bootstrap `list` | `estate-identity-lookup`: exact corpus generation and literal query semantics | N/P/G/C/J, database/search providers | Working literal lookup; preserve it. No measured Python gain. |
| Namespace/AND-word catalog filter; `ProviderCatalog.search` | `provider-catalog-query`: declared fields, source identity, query/ranking policy | Current N filter; P retrieval worker; JVM search engine; SQL/vector/search service | Current filter is local. Extract platform search boundary (F3); Python becomes valuable as retrieval sophistication grows. |
| Candidate-to-capability exact membership join; `providers` | `candidate-capability-link-query`: explicit identity links and candidate status | N/P/G/C/J, relational/graph store | Keep exact lookup as a local view; inferred matches require a separate capability. |
| Corpus ingestion, chunking, lexical/vector indexing, hybrid retrieval and reranking | `sda-retrieval-provider` + `sda-document-intelligence-worker`: frozen corpus, source spans, access filters, index/model digests | P ingestion/reranking workers; JVM search engines; SQL/vector stores; remote search; N orchestration | Missing. Material Python value for model-backed ranking and corpus pipelines; lexical/SQL search alone need not be Python. |
| Precedent/authority retrieval and source grounding | `sda-retrieval-provider` specialization `authority-grounded-retrieval`: receipt-bearing sources, exact generation, no candidate self-admission | Existing admitted estate query capabilities where applicable; P/J/SQL/graph/search providers after admission | Missing as a first-class CLI query path. Reuse admitted retrieval authority before adding a new search implementation. |

## 5. Data and statistical mechanics

None of these analytical computations exists in current runtime source. Sorting,
JSON parsing and display counts are class 1/2 mechanics, not a data-science engine.

| Responsibility | Required capability profile | Candidate runtime/provider families | Python assessment |
| --- | --- | --- | --- |
| API sample/schema profiling, missingness and response-shape distributions | `sda-data-quality-worker`: bounded sample corpus, schema version, units/nullability, summaries with evidence | P dataframe/scientific workers; SQL; Rust/Node Polars; JVM processing services | Material for large or heterogeneous samples; basic OpenAPI parsing alone has limited Python advantage. |
| Dataframe transforms, joins, normalization and corpus preparation | `bounded-data-processing`: declared transformations, schema/precision preservation, lineage and memory limits | P Polars/pandas; Rust/native/Node Polars; SQL engines; JVM distributed workers | Material for integration with models/statistics; compute libraries may be native and multi-language. |
| Latency/cost/quality distributions, confidence intervals and experimental provider comparisons | `statistical-provider-evaluation`: sampling design, units, uncertainty, seed/method, missing-data policy | P SciPy/scientific workers; R statistics; SQL analytics; managed statistical service | Strong candidate. Timing one request or comparing JSON is insufficient evidence. |
| Metric aggregation, drift and model-comparison analysis | `sda-model-evaluation-worker` + `statistical-evidence-analysis`: metric definitions, data splits, uncertainty and reproducibility | P scikit-learn/SciPy workers; R statistics; qualified evaluation services | Material; AI/model execution is class 3, metric computation belongs here. |

## 6. External-provider mechanics

| Responsibility / state | Required capability profile | Candidate runtime/provider families | Disposition and Python value |
| --- | --- | --- | --- |
| Live RapidAPI/CNCF/API-description acquisition | `bounded-provider-source-observation`: source URL/version, acquisition evidence, size/deadline/effect limits | N/P/G/C/J HTTP clients; admitted catalog/search APIs | Not implemented. Local illustrative JSON is not live acquisition. Python has no universal advantage for simple HTTP. |
| Native operation discovery and API conformance probes | `provider-operation-conformance`: source schema, generated cases, bounded exchanges, attributable failures | P Schemathesis providers; N/C/J/Go testing adapters; external API-test service | Material Python value for generated OpenAPI/GraphQL tests; keep tests within explicit effect budgets. |
| Credential resolution, entitlement, quotas, retries, native invocation and cancellation | `governed-provider-exchange`: credential references, spend/entitlement policy, idempotency and effect evidence | N/P/G/C/J/native gateways; provider SDKs; admitted external APIs | Not implemented in the CLI. Select by provider SDK, operational constraints and evidence, not terminal language. |
| Native-to-canonical mappings and provider replacement | `canonical-provider-mapping` + `provider-replacement-evaluation`: contracts, units, semantic invariants and parity proof | N/P/G/C/J deterministic mapping providers; P for data profiling; external mapping services | Domain implementations absent; place behind authority. ML may propose mappings but cannot establish equivalence. |
| Assimilation composition | Composite: source observation (6), parse/validate (2), retrieve precedent (4), propose taxonomy/mappings (3), profile evidence (5), admit/govern (2) | Mixed admitted providers; no single language required | `assimilate --via` only forwards input today. Python can supply the AI/data/retrieval portions; keep transport and governance independently qualified. |
| Author/install/govern/publish orchestration and effects | Capability-specific authoring, realization, lifecycle and publication profiles; generic gates are class 2, model authorship class 3 | Existing Harness capabilities plus their admitted N/P/G/C/J/service providers | Delegation only in this package. No remote publication, deployment or lifecycle policy is implemented by the CLI. |

## Where Python would materially improve the requested workloads

| Requested workload | Assessment and evidence | Boundary and qualification measure |
| --- | --- | --- |
| API/provider assimilation | **Material for generated API tests and data/model work; conditional for parsing and HTTP.** Schemathesis exposes a Python API for OpenAPI/GraphQL loading and generated/stateful tests. [Schemathesis](https://schemathesis.readthedocs.io/en/stable/reference/python/) | Freeze schema/operations and test budget; measure defect detection, reproducible failures, throughput and mapping coverage. No unbounded live probing. |
| Semantic evaluation | **Material for model/rubric experiments and benchmark integration.** Python tooling supports evaluation metrics and comparisons; the evaluator still needs SideFX-specific reference judgments. [Hugging Face Evaluate](https://huggingface.co/docs/evaluate/index) | Measure agreement with independently labeled cases, false acceptance, abstention and cost. Schema validity and business acceptance remain distinct. |
| Taxonomy inference | **Material candidate.** Sentence embeddings combined with clustering provide practical experiment paths, while scikit-learn exposes clustering methods and their differing assumptions. [scikit-learn clustering](https://scikit-learn.org/stable/modules/clustering.html) | Test against a reviewed ontology, including ambiguous/out-of-scope operations. Measure cluster stability and mapping precision; clusters remain proposals. |
| Retrieval | **Material for semantic retrieval/reranking; not necessary for the current literal filter.** Sentence Transformers supports retrieval with embeddings and reranking. [Sentence Transformers](https://www.sbert.net/docs/sentence_transformer/usage/usage.html) | Frozen corpus and query set; compare recall@k/nDCG, citation correctness, access filtering, latency and index rebuild cost against lexical baseline. |
| Embeddings | **Material for local-model flexibility and batching.** The same library supplies embedding generation and similarity operations. Node also has an ONNX Runtime binding, so it remains a candidate for compatible inference workloads. [Sentence Transformers](https://www.sbert.net/docs/sentence_transformer/usage/usage.html), [ONNX Runtime Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) | Pin model/tokenizer/dimensions/normalization; measure retrieval quality, memory and throughput on identical inputs. Runtime can differ without changing capability identity. |
| Statistical analysis | **Strong Python candidate.** SciPy supplies bootstrap confidence intervals and resampling methods. [SciPy bootstrap](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html) | Declare sample design, missingness, method and seed; test known reference distributions and numerical tolerances. A library result is not a policy decision. |
| Model evaluation | **Strong Python candidate.** Scikit-learn provides scoring/metrics and Hugging Face Evaluate supports model-evaluation workflows. [scikit-learn metrics](https://scikit-learn.org/stable/modules/model_evaluation.html), [Evaluate](https://huggingface.co/docs/evaluate/index) | Separate training/tuning/test data; pin metric code, model and dataset; record uncertainty, leakage checks and attributable evaluator testimony. |
| Data processing | **Material for integrated profiling/ML pipelines, not an exclusive runtime claim.** Polars provides structured transformations, lazy execution and streaming; its Rust core is exposed to Python and Node as well. [Polars](https://docs.pola.rs/) | Compare exact schema/units/nulls/precision, lineage, memory and throughput. Choose the provider that satisfies the profile; Python syntax alone does not make native compute faster. |

These are library capability observations from primary documentation checked on
the review date. No candidate was installed, timed, trained or evaluated in this
review, and no invented fit score (such as 94 versus 71) is used for selection.

## Required profile contract and next bounded work

For each independent responsibility, resolve existing authority before creating
a profile. The request must name canonical capability/scenario identity,
required mechanic/profile version and digest, input/outcome contracts, effect
budget, target/runtime constraints, data residency, CPU/GPU/memory/deadline needs,
precision/determinism requirements and evidence obligations. The provider catalog
must supply an exact provider artifact/model identity, declared targets and current
admission/conformance testimony. Reject ineligible candidates before applying any
approved ranking policy; missing evidence must permit an explicit hold.

The resolution result must bind the selected provider, runtime/transport,
capability/contract/profile digests, catalog generation and selection evidence.
The CLI carries that result to a driver. Provider invocation must retain the same
Input -> Event -> Outcome contract and return native testimony with canonical
outcome-admission evidence. Neither an LLM proposal nor a route-file entry can
admit itself.

Recommended sequence:

1. Qualify the existing terminal as a candidate interface provider and preserve its
   command/stream regression tests. Qualify a supported Node LTS baseline.
2. Define/resolve the shared representation and invocation contracts; decouple
   execution eligibility from display completeness and correct the mechanic/provider
   identity projection. Preserve current Node mechanics as provider candidates.
3. Connect the existing managed provider resolver and execution drivers through
   those contracts. Prove a real second provider boundary before claiming polyglot
   resolution. Do not create parallel CLIs.
4. Add one evidence-backed Python provider where it buys useful capability:
   bounded API conformance/profiling or grounded retrieval are suitable pilots.
   Keep exact supplied source data and compare against the existing baseline.
5. Add model/taxonomy/statistical providers only with their own evaluation profiles.
   Promote shared search and evidence rules through the governed Harness lifecycle.

Cross-Apply should use the **same authority where two providers claim the same
profile**, with exact deterministic equivalence or declared statistical tolerances
as applicable. Complementary providers doing different jobs need composition proof,
not artificial language parity. Working Node mechanics remain in place throughout.

## Review scope and source basis

Inspected all files under `src/`, `bin/sfx.mjs`, package metadata, examples,
unit/process tests, live integration test and CI configuration. The responsibility
inventory describes observed implementation and explicitly identifies absent work.
The source files are preserved in this review; repository naming and documentation
are the implementation changes authorized here.

The supplied attachment's decision hierarchy agrees with the local SDA
[language-specialization strategy](../../scenario-driven-architecture/docs/architecture-at-scale-and-enterprise-evolution.md)
and [enterprise reference architecture](../../scenario-driven-architecture/docs/enterprise-capability-operating-system-reference-architecture.md).
These are design context, not a replacement for querying current provider admission.
The Harness's [RapidAPI strategy](../../agentic-harness/docs/rapidapi-provider-integration-strategy.md)
also distinguishes missing mechanics from local scripts. Sibling-document links
are workspace review references; none is a new runtime dependency.
