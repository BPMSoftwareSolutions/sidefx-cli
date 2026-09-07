# SideFX CLI architecture decisions: research and justification

**Status: research for review. No proposed design is adopted by this document. Implementation remains paused.**

Prepared 6 September 2026. This review evaluates the interrupted changes against the user's requirements: entity neutrality, information hiding, estate-owned meaning, no fallbacks, and visible architectural decisions before implementation. It does not authorize provisioning, capability admission, publication, dependency installation, or a language rewrite.

**Recommendation:** make the CLI a consumer of an explicitly selected estate's command and representation contracts. Remove its implicit entity vocabulary and semantic fallback paths. Reuse the estate's existing delivery and discovery boundaries where their actual contracts fit. Do not adopt the newly started JSON discovery provider or its policy language without first demonstrating the missing responsibility and comparing alternatives.

This is more than moving a JavaScript table into JSON. The estate must own which declarations are authoritative, how commands map to capabilities, what the discovery inventory covers, and what each result means. The CLI can own terminal mechanics and enforce a shared interface protocol.

**Correction: capability creation already has executable machinery**

The initial review omitted the documented scaffold and fast authoring paths. That omission made the subsequent assessment of creating a generic capability unnecessarily speculative. The Harness already provides reusable capability creation machinery. Establishing the remaining entity-search responsibility does not require inventing an authoring system or starting with a handwritten scanner.

The follow-up inspection at 2026-09-07 02:22 UTC (6 September locally), against Harness HEAD `c3a5fa57c41f2b142b2103ddda0bbc1bb594af0d`, established:

- **A lightweight executable-token path exists.** The [README](C:/lab/repos/agentic-harness/README.md:28), [repository architecture rules](C:/lab/repos/agentic-harness/CLAUDE.md:45), and [operational state](C:/lab/repos/agentic-harness/docs/capsule-estate-operational-state.md:114) distinguish creating, proving, collapsing, and executing a token from managed admission and publication. The repository's `capsule:provision` and `capsule:invoke-provisioned` package scripts and their installed platform implementation are present. The documented path derives scenario topology, verifies and executes exact capsule bytes, and retains the capsule and receipt. It explicitly reports unresolved slots; creating a token does not silently implement missing behavior.
- **The admitted scaffold capability exists.** The [README's scaffold contract](C:/lab/repos/agentic-harness/README.md:185) identifies `generate-executable-capability-scaffold` as the source of seven mechanical artifacts, including the semantic transformation skeleton. With an admitted blueprint, it consumes the exact blueprint, preserves its topology and bindings, and emits an embodiment receipt. Authorship is confined to remaining semantic obligations.
- **Slot resolution is already part of the scaffold.** Its [feature authority](C:/lab/repos/agentic-harness/features/generate-executable-capability-scaffold.feature:3) specifies the standard execution shell, mechanic/capability/provider/evidence slots, resolution against supplied inventory, and a bounded authoring queue. Missing slots are explicit; missing inventory is not treated as an empty estate. The generator itself is pure and does not collect a live inventory or admit a capability.
- **This is backed by a retained capsule.** The [scaffold capsule](C:/lab/repos/agentic-harness/capsules/generate-executable-capability-scaffold.sfxcap) has a Node runtime binding marked `fixture-proven` and 11 retained runtime fixtures. Its measured file digest, `sha256:1964af7aa6efd80dc21e9699e1a84eafb368899da0838e2f695cfad38b6b81aa`, matches the manifest record. These are inspected artifacts, not a fresh fixture run or a measured authoring-time result.

This corrects the implementation approach behind D3: first resolve reuse for generic entity search; if a capability is missing, use the existing declarative creation machinery and its exact unresolved obligations. Exercise the resulting search broadly against the estate, then narrow the same operation with a provider type filter. The CLI continues to consume the public capability contract. Managed publication follows its documented lifecycle when that is the requested outcome; it is not a prerequisite for every executable-token experiment.

This addendum records research only. No capability was generated or invoked, no provisioning skill was loaded, and implementation remains paused. The observations below retain their original snapshot date and commit identities; they are not a fresh report of the current working trees.

**Evidence and limits**

The [research observation record](C:/lab/repos/sidefx-cli/docs/evidence/architecture-decision-research-2026-09-06.json) retains commit identities, working-file hashes, capsule-authority digests, command outcomes, and limitations. Both checkouts contained earlier uncommitted changes. The CLI HEAD was `478139c7097389efc0020cd63b1f767b6a38b225`; Harness HEAD was `b472234c8f245b6e648a873b2d32ff588825b504`. These are local observations, not claims about the current remote branch.

| Observation | Verified result | What it establishes |
| --- | --- | --- |
| Admitted capsule manifest | 219 records; all 219 capsule file digests matched | A bounded, identifiable admitted inventory exists. This digest check alone is not a fresh full conformance proof. |
| Actual `sfx capability list` | Exit 0; 220 entries | Current discovery combines 219 admitted capsules and one configured capability. |
| Actual `sfx provider list` | Exit 0; four entries | The public provider list still exposes the small configured catalog. |
| Actual `sfx mechanic list` | Exit 2; `COMMAND_REJECTED` | The selected estate currently cannot introduce this command through its configuration. |
| Decoded capsule JSON entries | Zero capsules with a nonempty top-level `commandBindings` array | The newly invented binding convention is not populated by the admitted capsules inspected. |
| Explicit provider fields in decoded binding arrays | 22 distinct provider names, 22 provider-capability IDs, 36 provider-profile IDs | Relevant declarations exist beyond the catalog. These are three different identity roles, not interchangeable provider counts. |
| Existing `provisioning/` data | 22 capsule files | The admitted manifest is not an inventory of every capability artifact in the repository. No provisioning workflow was invoked. |

For example, capsules explicitly reference `ScenarioKernel.NodePlatform.Schema.JsonSchemaContractAdmission` and `ScenarioKernel.NodePlatform.Execution.AuthorityTransformation`. That demonstrates missed declarations; it does not prove 22 independently selectable, installed, eligible services. The research census is observation, not a replacement production index.

The three CLI commands actually exercised were:

```powershell
sfx capability list --estate C:\lab\repos\agentic-harness --json
sfx provider list --estate C:\lab\repos\agentic-harness --json
sfx mechanic list --estate C:\lab\repos\agentic-harness --json
```

The last command failed as recorded. No live RapidAPI requests, full test run, clean install, or managed capability changes were performed for this research. Earlier reports of 51 passing tests do not qualify the interrupted edits.

**Decision register**

“Recommend” below means a design recommendation for review, not an implementation instruction or an adopted estate policy.

| ID | Decision | Recommendation |
| --- | --- | --- |
| D1 | Estate supplies entity types and operations | Adopt the boundary; reject every implicit built-in vocabulary fallback. |
| D2 | A new command JSON file becomes authority | Hold the particular format and placement; require an explicit authority relationship. |
| D3 | Build a separate generic JSON discovery provider now | Do not adopt the current prototype; establish the reuse gap first. |
| D4 | Discover through declarative source rules | Conditional mechanism inside an estate capability, with explicit coverage and identity semantics. |
| D5 | Use Node for discovery | Keep Node as a candidate; choose by required profile and evidence. No language ownership or symmetry rewrite. |
| D6 | Reuse the process request/response boundary | Retain useful transport mechanics; separate terminal command adaptation from provider-native contracts. |
| D7 | Accept opaque provider identities | Adopt typed, exact identities; reject spelling-based dispatch or invented equivalence. |
| D8 | Return flattened discovery data plus a receipt reference | Retain evidence; hold the new output shape until a versioned result contract is agreed. |
| D9 | Keep capsule and Gherkin interpretation inside the CLI | Reject as the destination architecture; place format knowledge behind estate representation boundaries. |
| D10 | Depend on manually installed private provider packages | Reject as a delivery strategy; require reproducible, explicitly selected artifacts. |
| D11 | Treat hashes or source labels as admission | Reject. Preserve integrity, provenance, admission, and execution eligibility separately. |
| D12 | Prove neutrality with a closed command list | Replace the architectural claim with extension, removal, integrity, and coverage tests. Keep undeclared-command rejection tests. |

**D1 — Estate-owned vocabulary, with no fallback**

The current [command model implementation](C:/lab/repos/sidefx-cli/src/commands.mjs) defines eight entity types and their operations, argument counts, and local/delegated behavior. The interrupted loader copies `defaultVocabulary` before applying external declarations. That means omission from the estate does not remove a command: the CLI restores it from its own model. The separate legacy parser in [cli.mjs](C:/lab/repos/sidefx-cli/src/cli.mjs) also needs consideration; removing only one table would leave another source of command authority.

Recommend an explicit estate command description as the sole source of semantic entity/operation declarations. A missing document, unsupported required protocol, removed declaration, stale binding, unavailable provider, or ambiguous operation must produce an attributable failure. Do not silently use a compiled table, sample catalog, cached previous generation, another estate, or another runtime.

The CLI still needs a small, stable bootstrap contract: terminal arguments and streams, explicit estate/connection selection, protocol negotiation, and help/version about the terminal itself. Those mechanics do not authorize a capability or enumerate business entity types. Estate-specific help and completion must come from the selected declaration.

This boundary has an established analogue: MCP exposes discoverable tool names and schemas through `tools/list`, with pagination and change notifications. It demonstrates that clients can consume a changing surface without compiling every tool name. It does not prescribe SideFX's entity model or require adopting MCP. [MCP tools specification, version 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Tradeoff: startup now depends on a valid declaration and an explicit way to obtain it. That dependency must be designed, not hidden with a default table. Compatibility aliases are possible only as explicitly selected authority declarations; they cannot resurrect removed semantics.

**D2 — Command description transport and command authority are different decisions**

A JSON file is a possible carrier, not proof of authority. The proposed `sfx-command-surface.v1` and `commands` configuration property were invented during the interrupted work; neither has been established as the estate's canonical public contract. Merely placing the file under `authority/cli/` would reproduce the ownership ambiguity of the small catalog.

Compare these alternatives before choosing storage:

| Alternative | Benefit | Limitation |
| --- | --- | --- |
| Existing estate delivery capability exports command metadata | Reuses semantic ownership and existing contracts | Its output must actually expose the required typed operations and bindings. |
| An exact artifact projected from estate authority | Portable, inspectable, and potentially usable offline | Requires an explicit generation, provenance, and authority binding; cannot become another manually synchronized model. |
| A new manually maintained CLI-specific command document | Easy to author initially | Risks duplicating the estate model and making configuration the de facto semantic authority. Not recommended as the default design. |

Prefer investigating the first alternative, with the second as a possible delivery form of the same authority. No choice is made here about a new filename, schema, endpoint, or capability identity.

The installed estate already provides a relevant precedent: its MCP adapter calls `deliver-capsule-estate-mcp` to obtain tool declarations, then registers their supplied names, descriptions, schemas, and annotations. Its operation adapter remains limited, but command metadata already has an estate-owned source. See [the installed adapter](C:/lab/repos/agentic-harness/node_modules/sda-bootstrap/src/capsule-mcp.mjs) and [the admitted capsule](C:/lab/repos/agentic-harness/capsules/deliver-capsule-estate-mcp.sfxcap).

A digest can establish that the loaded bytes match expected bytes. It does not establish who may issue the declaration. TUF makes this separation explicit through a trusted root and authenticated metadata relationships. This is an architectural analogy, not a recommendation to install TUF or add a new approval system. [TUF specification](https://theupdateframework.github.io/specification/latest/).

**D3 — Establish the missing discovery responsibility before building a provider**

The newly started [JSON discovery worker](C:/lab/repos/sidefx-cli/packages/json-discovery-provider/worker.mjs) is not installed or connected. It introduces manifest reading, tree traversal, embedded JSON decoding, projection rules, aggregation, filtering, and snapshot claims. Those are substantive platform and retrieval responsibilities. Calling the package generic does not justify introducing all of them.

The following reuse candidates were inspected. For the four schema-based candidates, the loose request-schema bytes matched the corresponding admitted capsule entries.

| Existing boundary | Evidence from its current contract | Reuse conclusion |
| --- | --- | --- |
| `operate-capsule-estate` and installed `listCapsules` | Verified admitted manifest; list filters capability IDs | Reuse for its admitted inventory scope. It does not enumerate every entity, token, or provider declaration. |
| `deliver-capsule-estate-cli` | Binds declared commands to canonical capsule operation requests | Existing command-adaptation precedent; not proof of all-entity discovery. |
| `deliver-capability-change-cli` | Declares open, seal, publish, and status with canonical mappings | Existing semantic command authority that the current `sfx` table does not expose. Do not infer its mapping from capability names. |
| `construct-sidefx-evaluation-object-catalog` | Requires a particular seed reference, digest, byte length, and `NON_PRODUCTION_WAVE1_EVALUATION` | A fixed evaluation catalog builder cannot be relabeled a complete live inventory. |
| `resolve-sidefx-eligible-providers` | Requires caller-supplied `providerBindings`; `NON_PRODUCTION_WAVE3_SPECIALIST_ASK` | Evaluates a supplied set. It does not prove that the set includes every estate provider. |
| `resolve-sidefx-semantic-knowledge-request` | Requires supplied catalog objects, identity/lexical indexes, relationships, and policy/snapshot digests | Potential query machinery; acquiring a current complete corpus remains a separate responsibility. |
| `resolve-sidefx-capability-precedents` | Requires indexed corpus and proof data; `NON_PRODUCTION_WAVE4_AUTHORING_MEMORY` | Useful precedent-resolution scope, not automatic live source discovery. |

Sources: [catalog construction request](C:/lab/repos/agentic-harness/authority/sidefx-semantic-brain/capabilities/construct-sidefx-evaluation-object-catalog/contracts/sidefx-evaluation-object-catalog-construction-request.schema.json), [provider resolution request](C:/lab/repos/agentic-harness/authority/sidefx-semantic-brain/capabilities/resolve-sidefx-eligible-providers/contracts/sidefx-provider-resolution-request.schema.json), [semantic knowledge request](C:/lab/repos/agentic-harness/authority/sidefx-semantic-brain/capabilities/resolve-sidefx-semantic-knowledge-request/contracts/sidefx-semantic-knowledge-request.schema.json), and [precedent request](C:/lab/repos/agentic-harness/authority/sidefx-semantic-brain/capabilities/resolve-sidefx-capability-precedents/contracts/sidefx-capability-precedent-request.schema.json).

Recommend a contract-level composition review: identify which existing boundary can describe the command surface, which enumerates source membership, and which supplies search and representation. Introduce a new capability/provider only for a precisely identified remaining gap. This research has not proved that no suitable composition exists anywhere in the estate. Therefore it does not justify proceeding with the scanner prototype.

**D4 — Declarative discovery rules need an authority and completeness contract**

An estate-owned ingestion adapter can legitimately know capsule formats or source schemas. The CLI should not. Parnas's information-hiding criterion assigns changeable representation decisions to modules that hide them from consumers; the relevant question is which changes propagate across a boundary, not whether the implementation was moved to another folder. [Parnas, “On the Criteria To Be Used in Decomposing Systems into Modules”](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html).

Selectors may be useful implementation configuration behind that adapter. Do not make arbitrary directory traversal or “objects with a provider-like key” the definition of the estate. Source membership, identity roles, admission relationships, and conflict handling must come from explicit authority. Providers, provider capabilities, provider profiles, mechanic IDs, connections, and open slots must remain distinguishable.

Discovery should account for every declared member of the selected scope and return source generation, coverage, and lifecycle state. A complete result with no matches must be distinguishable from an unavailable source or incomplete enumeration. Pagination must cover one coherent generation. A required source failure cannot silently narrow the search to whatever remained readable.

The prototype does not establish these properties. It accepts `source.state` labels, keeps the first scalar value when declarations conflict, and rechecks only files it already observed. A newly added file can therefore escape its final snapshot check. These are reasons to withhold a completeness claim, not a claim that directory-based ingestion is inherently invalid.

For the user's request, recommend searching the estate's full declared discovery scope and retaining state distinctions. Do not silently limit “exists” to “admitted,” and do not imply “discoverable” means “eligible to execute.” The exact scope membership must be defined by the estate rather than guessed from the count of folders.

**D5 — Runtime choice follows the required capability profile**

Preserving the working Node terminal is justified. It does not assign Node ownership of provider assimilation, semantic retrieval, taxonomy inference, or evaluation. No benchmark or conformance comparison in this research establishes a winning runtime for a new discovery provider.

| Responsibility class | Required profile | Eligible families and present recommendation |
| --- | --- | --- |
| Interface/terminal mechanics | Argument and stream handling, cancellation, transport, public schema enforcement | Existing Node CLI remains a candidate. Other interface runtimes need not be implemented for symmetry. |
| Deterministic generic platform mechanics | Bounded reads, exact-byte integrity, schema validation, stable identity handling | Node, Python, .NET, JVM, Go, Rust, or an explicitly bound service can qualify. Choose by conformance and deployment evidence. |
| AI/ML mechanics | Model execution, taxonomy inference, model and dataset versioning, evaluation | Python or a managed model service may materially help; other runtimes can qualify through their provider contracts. Keep inference separate from admission. |
| Retrieval/search mechanics | Exact enumeration, lexical indexing, optional embeddings/reranking, measurable coverage | A deterministic index may be sufficient for existence queries. Python, JVM/search services, Node, and other providers remain candidates. |
| Data/statistical mechanics | Structured ingestion, joins, distributions, sampling, statistical or model evaluation | Python and R ecosystems deserve evaluation when these responsibilities are required; SQL/data services and other runtimes also qualify by profile. |
| External-provider mechanics | Protocol assimilation, credentials, bounded effects, native response handling | Use the required protocol/provider profile. Do not add RapidAPI or another vendor as a CLI command family. |

Node and Python both document process creation with explicit arguments and controlled streams. Process isolation alone therefore supplies no reason for a language rewrite. [Node child processes](https://nodejs.org/api/child_process.html), [Python subprocess](https://docs.python.org/3/library/subprocess.html).

Python ecosystem capabilities can materially improve a richer search or analysis provider: Sentence Transformers supplies embedding-based semantic search; pandas supports numerous structured data formats; scikit-learn provides model evaluation procedures. These are concrete candidates when the required behavior includes semantic matching, provider-response analysis, or model comparison. They do not solve missing inventory authority or prove taxonomy correctness. [Sentence Transformers semantic search](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html), [pandas I/O](https://pandas.pydata.org/docs/user_guide/io.html), [scikit-learn cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html).

For API assimilation, first distinguish schema parsing and protocol binding from semantic mapping and empirical evaluation. A Python advantage in analysis does not automatically establish an advantage in all three. Require representative provider descriptions, expected mappings, measured correctness, and installation costs before selecting an implementation.

**D6 — Keep the process transport; separate command adaptation from native behavior**

The existing [process runtime](C:/lab/repos/sidefx-cli/src/process-runtime.mjs) already passes JSON over stdin/stdout, starts a declared executable without a shell, limits output, separates diagnostics, and records delivery failures. Retain these useful mechanics subject to contract and conformance review. This is a transport boundary, not a security sandbox or an eligibility evaluator.

The [HTTP worker](C:/lab/repos/sidefx-cli/packages/http-provider/worker.mjs) currently requires a command whose object is `provider` and whose verb is `evaluate`. A specifically declared CLI adapter may legitimately understand that grammar. A reusable HTTP transport library should not require it. Place command-to-native-input interpretation in an estate-owned delivery contract or adapter, and keep bounded HTTP mechanics callable through their native contract.

The mapping must be explicit. Renaming a terminal alias should not require rewriting HTTP execution. Conversely, accepting arbitrary commands without validating the declared request contract would not be neutrality. OpenAPI's operation and request/response descriptions illustrate the distinction between operation identity and the protocol messages used to invoke it; they are a candidate source for assimilation, not automatic semantic mappings. [OpenAPI 3.1.1 Operation Object](https://spec.openapis.org/oas/v3.1.1.html#operation-object).

Do not require every nonterminal consumer to manufacture an `sfx` command. Passing the unchanged native input remains valuable; optional command context must have an explicit role and version. Provider-native result dispositions must survive delivery unchanged.

**D7 — Typed, opaque identities**

The estate already uses several forms: catalog IDs with slashes, qualified implementation names, and profile identifiers containing colons. The original two-segment provider regex was therefore a CLI-imposed model restriction.

Recommend preserving an explicit entity type, the exact identity within its authority scope, and an authority/version reference when needed. Do not lowercase, split, normalize, select a runtime, infer an entity type, or merge equivalent-looking names unless the selected identity contract authorizes it. W3C's URI-opacity guidance supplies the same general principle for URI consumers; applying it to SideFX's non-URI identities is an architectural inference. [W3C Web Architecture, URI opacity](https://www.w3.org/TR/webarch/#uri-opacity).

Opaque does not mean unvalidated. Enforce declared identity contracts and generic transport limits; store identities through a safe mapping rather than using them as filesystem paths. Namespace filtering is legitimate only where the estate declares namespace semantics. The interrupted broader ASCII regex is an improvement over one vendor-style shape, but it is still not a universal identity contract.

**D8 — Evidence and result shape**

Preserve execution evidence. A discovery response should identify the selected estate generation, command authority, provider binding, coverage, and original result. A delivery receipt must remain separate from provider conformance or capability admission.

The interrupted `represent()` spreads the provider result into a new object and adds `representationEvidence`. That changes the public JSON contract and can overwrite a field with the same name. Do not establish this wrapper through convenience code. Agree on a versioned result/evidence envelope or an explicitly declared representation contract first; define reserved fields, payload preservation, failure results, and compatibility behavior.

PROV-DM distinguishes entities, activities, responsible agents, derivations, and collections. It supports the need to identify the source set and the activity that produced a result; it does not turn provenance into a correctness or admission verdict. Reuse compatible concepts rather than introducing a new ontology solely for the CLI. [W3C PROV-DM](https://www.w3.org/TR/prov-dm/).

Generic JSON output can be an explicitly selected representation, not an error-recovery fallback. Human rendering should consume declared public display metadata or an estate representation capability. Formatting must not recalculate success, eligibility, or semantic equivalence.

**D9 — Hide capsule layout and authoring-language knowledge**

[projection.mjs](C:/lab/repos/sidefx-cli/src/projection.mjs) knows authority entry filenames, plan versions, graph-cell structure, Gherkin-derived identities, and provider-binding layouts. [runtime-worker.mjs](C:/lab/repos/sidefx-cli/src/runtime-worker.mjs) knows the manifest directory and loads the Gherkin parser. Some code selects `runtimeBindings[0]` without providing a general multi-binding representation.

These facts establish a real information-hiding gap even though vendor strings have been removed. Recommend a stable public inspect/describe/representation boundary owned by the estate. New capsule layouts, authoring languages, and execution-plan versions should require changes behind that boundary, not a terminal release. All relevant runtime bindings should be represented; selecting one should require declared selection authority.

A shared protocol necessarily has supported versions and required semantics. Genericity does not mean accepting unknown mandatory fields blindly. JSON Schema itself distinguishes declared dialects and required vocabularies; unsupported required vocabularies must be rejected. SideFX should define its own compatibility contract explicitly, rather than treating its execution-plan version allowlist as a universal public interface. [JSON Schema Core 2020-12](https://json-schema.org/draft/2020-12/json-schema-core).

Do not migrate to MCP, HTTP, or another transport merely to move this coupling elsewhere. Compare the existing admitted delivery contracts first. The desired outcome is a stable boundary with an identified owner and tested substitutions.

**D10 — Reproducible provider delivery and explicit resolution**

The installed `@sidefx/http-provider` is version 0.1.1. Harness's dependency and lock files do not declare it. Both provider packages currently have `private: true`; the interrupted discovery package is only untracked source. A package source directory and a runtime digest pin are not a reproducible distribution path.

Official npm behavior is material here: `npm ci` removes the existing `node_modules` directory and installs the locked project. Therefore the present HTTP installation is not preserved by that workflow. This conclusion follows from the package files and npm's documented behavior; no destructive clean-install experiment was performed. [npm ci documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

Recommend an explicitly selected, versioned, retrievable provider artifact and a declared installation relationship that survives a clean environment. A locked dependency or another estate-authorized artifact mechanism may satisfy this. Do not select a publication mechanism, repository layout, or package registry without reviewing the estate's packaging constraints. No new registry publication is proposed as an automatic next step.

[runtime-artifacts.mjs](C:/lab/repos/sidefx-cli/src/runtime-artifacts.mjs) currently tries the estate's package resolution and then the CLI installation's resolution. That is another implicit fallback to address under the user's instruction. The selected provider binding should identify the resolution authority; a missing artifact must fail rather than search another installation for a substitute.

The CLI HEAD still exports HTTP provider modules and includes `packages/` and `config/` in its package files. The working tree removes those exports/directories from distribution. Neither HEAD nor the uncommitted package state should be described as the same delivered product. Release and fresh-install evidence must refer to exact artifact bytes.

**D11 — Preserve authority and state distinctions**

Discovery testimony, configured capability authority, provisioned tokens, admitted capsules, published artifacts, installed providers, and execution eligibility are different relationships. Their labels cannot be inferred from a pathname, copied from arbitrary source configuration, or manufactured from a successful request.

Keep byte integrity, source attribution, managed admission, availability, and operation eligibility independently inspectable. A provider can be discoverable and unavailable. A capability can be provisioned and outside the admitted manifest. A catalog record can be useful evidence without authorizing execution. A successful HTTP response proves the bounded observation, not general provider interchangeability.

This follows the estate's existing [capsule-first law](C:/lab/repos/agentic-harness/docs/capsule-first-capability-law.md) and the configured-runtime distinction already recorded in [the current CLI architecture document](C:/lab/repos/sidefx-cli/docs/architecture.md). The review does not invoke a provisioning skill or add a governance workflow. It identifies claims the discovery boundary must preserve.

Two regex-based redaction implementations also diverge between the CLI's receipt layer and the provider's credential layer. Recommend one agreed behavior contract with cross-boundary conformance tests. Different runtime implementations may still be needed; centralizing executable code is not the same decision as centralizing the contract. Do not move provider credential resolution into the terminal to remove duplication.

**D12 — Evidence required before claiming the new architecture works**

These are proposed acceptance criteria, not tests run during this research:

1. Supply authority declaring an unfamiliar entity and operation. The unchanged CLI parses, displays help for, and dispatches them through the declared capability boundary. A real estate declaration must be exercised after the synthetic contract test.
2. Remove that declaration, omit the command document, corrupt its authority reference, or make its selected provider unavailable. Each case fails explicitly without another vocabulary, catalog, provider, or runtime being substituted.
3. Use identical identity text for two entity types and identities with different qualified forms. Preserve type and identity exactly through lookup, invocation, and evidence.
4. Compare discovery against the selected estate's authoritative source membership. Demonstrate declarations beyond the four catalog entries, retain provider/profile/mechanic distinctions, and account for every required source and page.
5. Change capsule representation or runtime family behind the public contract. The terminal needs no source edit. Missing required protocol semantics still fail explicitly.
6. Run the released CLI and provider artifacts from a clean installation using only declared dependencies. Retain exact versions/digests and inspect the resulting receipts.
7. Preserve the existing bounded HTTP evaluation through `sfx`, including native output and denial evidence, after the approved migration. Do not substitute curl or an SDK-only test.

Rejecting an undeclared command remains correct. The flaw in the earlier neutrality claim was treating a permanently compiled entity set as the authority for that rejection. The replacement tests must prove both extension by declaration and rejection without declaration. Vendor-string scans and green fixtures alone do not establish either complete discovery or information hiding.

**Disposition of the interrupted changes**

| Current change | Research disposition |
| --- | --- |
| `loadCommandSurface()` copying `defaultVocabulary` | Reject the merge/default design; it directly conflicts with no fallbacks. |
| Configurable command parsing, bindings, help, and generic rendering | Useful prototype mechanisms, contingent on the agreed public authority and result contracts. Not ready for adoption. |
| New JSON discovery package and selector policy language | Hold. Do not install or connect it without a demonstrated reuse gap and a reviewed inventory contract. |
| Broader provider identity validation | Directionally justified; replace assumptions with declared identity semantics and collision tests. |
| Representation result flattening | Hold pending a versioned output/evidence contract. |
| Existing generic process transport | Retain as a candidate mechanism; qualify runtime selection, input adaptation, and clean installation. |
| Capsule/Gherkin interpretation inside CLI code | Document as coupling to remove behind an estate-owned boundary, not as solved neutrality. |

The next decision review should settle the command-authority source, the complete discovery scope and reuse composition, the public request/result contracts, and the reproducible runtime binding. Exact implementation files, new capability identities, a provider language, and a new JSON policy dialect should follow those decisions. No implementation changes, rollback, or dependency changes were made while preparing this document.
