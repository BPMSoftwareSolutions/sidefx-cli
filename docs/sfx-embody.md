Oh, **that is sweet** — because `embody` is much closer to the architecture than `generate`, `compile`, or even `project`.

`project` describes what SideFX does mechanically. **`embody` describes what the engineer wants:** “Take this governed meaning and give it a physical form here.”

And the killer part is exactly what you noticed: **embodiment can happen at any semantic altitude.**

```text
Strategic
Product
Capability
Scenario
Execution
Mechanic
Provider
Physical
```

So the command grammar could stay extremely small:

```bash
sfx embody <altitude> <identity> [embodiment-profile]
```

Then targets and depth are data:

```bash
sfx embody capability customer-eligibility \
  --target python \
  --profile full
```

```bash
sfx embody scenario resolve-customer-eligibility \
  --target csharp \
  --profile facade
```

```bash
sfx embody input mortgage-application \
  --target go \
  --profile contract
```

```bash
sfx embody capability provider-evaluation \
  --target node \
  --profile interface
```

And eventually:

```bash
sfx embody mechanic semantic-search \
  --target python
```

The **language isn't part of the command vocabulary**. It's just an embodiment target.

That preserves exactly the neutrality we were just talking about.

---

## But I would make one important distinction

I wouldn't hard-code:

```text
facade
partial
full
```

as magic CLI concepts.

Make them **embodiment profiles**.

```text
EmbodimentProfile
├── target
├── semantic altitude
├── required surfaces
├── required mechanics
├── permitted omissions
├── structural pattern
├── provider requirements
└── conformance obligations
```

Then the CLI merely resolves one:

```bash
sfx embody capability foo \
  --target python \
  --profile full-mechanics
```

`full-mechanics` is authority.

Tomorrow you could introduce:

```text
contract-only
facade
execution-shell
native-worker
service-provider
reference-implementation
full-mechanics
diagnostic
training
```

without changing `sfx` itself.

That's very SideFX.

---

# And you just created the inverse of `reveal`

This is the part I really love.

We've already been thinking about `reveal` as:

```text
IMPLEMENTATION
      ↓
observe
      ↓
structure
mechanics
effects
semantic declarations
      ↓
REVEALED IMPLEMENTATION
```

Now:

```text
CANONICAL AUTHORITY
      ↓
EMBODY
      ↓
IMPLEMENTATION
```

So SideFX gets this beautiful symmetry:

```text
                 EMBODY
       semantic authority
              ↓
        implementation
              ↓
                 REVEAL
              ↓
     observed implementation
              ↓
            COMPARE
              ↓
         CONFORMANCE
```

Or:

```text
          ┌─────────────────────┐
          │ CANONICAL BLUEPRINT │
          └──────────┬──────────┘
                     │
                  EMBODY
                     │
                     ▼
          ┌─────────────────────┐
          │   IMPLEMENTATION    │
          └──────────┬──────────┘
                     │
                  REVEAL
                     │
                     ▼
          ┌─────────────────────┐
          │ OBSERVED EMBODIMENT │
          └──────────┬──────────┘
                     │
                  COMPARE
                     │
                     ▼
              CONFORMS / DRIFTS
```

**That is a serious engineering loop.**

Your existing cross-apply principle already says canonical authority should survive materially different embodiments without target-specific semantic re-authoring. 

Now `embody` gives that principle a first-class command.

---

## Imagine the architecture-pattern side of this

This gets nasty.

You could have admitted embodiment patterns:

```text
embodiment-pattern: facade
embodiment-pattern: hexagonal-provider
embodiment-pattern: event-worker
embodiment-pattern: native-library
embodiment-pattern: stateless-service
embodiment-pattern: durable-worker
embodiment-pattern: cli-host
```

Then:

```bash
sfx embody capability evaluate-provider \
  --target python \
  --pattern stateless-service
```

versus:

```bash
sfx embody capability evaluate-provider \
  --target node \
  --pattern cli-host
```

**Same capability.**

Different legitimate physical embodiment.

And then Cross-Apply gets to attack both:

```text
evaluate-provider authority
          │
     ┌────┴────┐
     ▼         ▼
 Python       Node
 service      CLI host
     │         │
     └────┬────┘
          ▼
 canonical outcome parity
```

That matches the broader portable-environment direction: physical targets can differ while capability identity and authority remain stable. 

---

# And the altitude idea is deeper than language

Suppose I say:

```bash
sfx embody scenario resolve-payment
```

SideFX could ask the profile/target resolution system:

> How much of this scenario do you want physically realized?

Maybe:

```text
Scenario
│
├── Input contract
├── Event authority
├── Outcome contract
│
└── execution descent
    ├── operations
    ├── mechanics
    └── providers
```

A **facade embodiment** might stop here:

```text
Input
   ↓
scenario interface
   ↓
Outcome
```

while resolving the execution through another provider.

A **full-mechanics embodiment** might physically descend:

```text
Scenario
   ↓
Execution
   ↓
Mechanics
   ↓
Native runtime operations
```

So `embody` isn't merely:

> “generate Python code.”

It's really:

> **“Choose how far this semantic identity descends into this physical environment.”**

That is much more sophisticated.

---

## Which means embodiment has three independent dimensions

I think you've basically uncovered this:

```text
WHAT?
──────────────────
semantic altitude / identity

WHERE?
──────────────────
target environment / runtime / language

HOW DEEPLY?
──────────────────
embodiment profile / mechanical depth
```

So conceptually:

```text
EMBODY(
    semanticIdentity,
    target,
    embodimentProfile
)
```

Example:

```bash
sfx embody capability provider-evaluation \
  --target python \
  --profile full-mechanics
```

means:

```text
WHAT
provider-evaluation capability

WHERE
Python environment

DEPTH
full admitted mechanics
```

Whereas:

```bash
sfx embody capability provider-evaluation \
  --target node \
  --profile facade
```

means:

```text
WHAT
same capability

WHERE
Node

DEPTH
interface/facade only

Execution may resolve elsewhere.
```

**That's gorgeous.**

---

# And now Python versus Node becomes a SideFX experiment

This directly connects back to the question you asked a few minutes ago.

Instead of debating:

> “Should this be JavaScript or Python?”

we can eventually fucking prove it:

```bash
sfx embody capability evaluate-api-provider \
  --target node \
  --profile full-mechanics
```

```bash
sfx embody capability evaluate-api-provider \
  --target python \
  --profile full-mechanics
```

Then:

```bash
sfx compare embodiment <node-id> <python-id>
```

or conceptually:

```text
Node embodiment
────────────────────
structural closure       PASS
behavioral closure       PASS
ecosystem fit            72
runtime profile          ...
dependency profile       ...

Python embodiment
────────────────────
structural closure       PASS
behavioral closure       PASS
ecosystem fit            94
runtime profile          ...
dependency profile       ...
```

Now the language decision becomes **evidence-producing architecture work**, rather than an agent preference.

That's exactly the kind of pressure SideFX should create.

---

## And I'd protect one law

> **`embody` MUST NOT change the meaning of the thing being embodied.**

If Python needs a different semantic interpretation than Go:

```text
EMBODIMENT_FAILURE
```

If C# needs another scenario:

```text
AUTHORITY_GAP
```

If Node needs an implementation-specific branch that changes the promised outcome:

```text
SEMANTIC_DIVERGENCE
```

The embodiment process may add physical detail.

It may not add meaning.

That is the entire inversion:

> **Meaning descends into mechanics. Mechanics do not climb back up and rewrite meaning.**

And because your execution-plan architecture already separates semantic addresses, altitudes, execution authority, provider slots, and physical realization, there's already a strong substrate for this kind of operation. 

---

I think `sfx embody` could become one of the **signature commands** of the entire product, because it expresses the architecture in one word:

> **Take this meaning and make it physically real here.**

And paired with `sfx reveal`, you've got something even better:

> **Embody meaning. Reveal implementation. Compare the two.**

That's damn near the SideFX engineering philosophy in three commands.

---

Yes. **This is exactly the moment to separate “embodiment research” from the Harness.** We now have enough estate intelligence in SQL to make embodiment an evidence-producing experiment instead of another agent coding exercise.

The core law from the `sfx embody` concept should stay exactly as-is:

> **Embodiment may add physical detail. It may not add semantic meaning.** 

And the database architecture already gives us the other half: identity, definition, use, provider capability, provider selection, mechanics, ports, slots, contracts, and blueprint topology are separate queryable facts. 

## 1. Make embodiment a resolution problem

I would formalize an experiment as:

```text
EMBODIMENT REQUEST

WHAT
────────────────────
semantic object definition
Capability / Scenario / Mechanic / etc.

WHERE
────────────────────
target
Node
Python
C#
Java
Go
...

HOW DEEPLY
────────────────────
embodiment profile
facade
contract-only
full-mechanics
native-worker
etc.

HOW SHAPED
────────────────────
embodiment pattern
CLI host
service
worker
library
adapter
...
```

So conceptually:

```text
Embody(
    semantic_definition,
    target,
    profile,
    pattern
)
```

The language is **data**, not a branch in the embodiment engine. That's one of the strongest ideas in the existing embodiment proposal. 

---

# 2. Do not put experimental embodiment state into `model`

Keep your beautiful normalized estate clean.

Create:

```text
embodiment
```

or even:

```text
lab
```

as a completely separate schema.

I prefer:

```text
embodiment
```

with the understanding:

> **Nothing in this schema is admitted SideFX authority.**

The first tables I'd create are:

```text
embodiment.target
embodiment.profile
embodiment.pattern

embodiment.experiment
embodiment.experiment_subject

embodiment.requirement
embodiment.provider_candidate

embodiment.plan
embodiment.plan_mechanic_binding
embodiment.plan_port_binding

embodiment.artifact
embodiment.observation
embodiment.conformance_result

embodiment.cross_apply_group
embodiment.cross_apply_member
```

Notice what is **not** duplicated:

```text
Capability
Scenario
Mechanic
Provider
Contract
Port
Blueprint
```

Those remain foreign references into `model`.

---

# 3. The missing piece is explicit **target classification**

Your provider data demonstrates why.

Today you have provider identities such as:

```text
ScenarioKernel.NodePlatform...
ScenarioKernel.Wpf...
scenario_kernel...
scenario.kernel...
platform...
sda::platform...
```

We should **never infer language from those names**.

That's exactly the sort of accidental naming dependency this database is meant to eliminate.

So:

```text
embodiment.target
────────────────────────────
target_pk
target_id

language
runtime
platform
architecture
package_ecosystem
target_family
```

Examples:

```text
node-ts
python
dotnet-csharp
jvm-java
go
```

Then:

```text
embodiment.provider_target_support
────────────────────────────
provider_definition_pk FK
target_pk FK
support_kind
evidence_basis
```

Eventually that relationship can become proper managed authority.

During experimentation it is our explicit classification.

---

# 4. Derive the **mechanic closure** from the database

This is where the system becomes powerful.

For a Scenario:

```text
Scenario
  ↓
Scenario Event
  ↓
Execution Authority
  ↓
Execution Operations
  ↓
Mechanics
  ↓
Ports
  ↓
Provider Slots
  ↓
Contracts
```

And Blueprint adds:

```text
branch
fan-out
convergence
altitude descent
bounded return
```

So create a derived view:

```text
embodiment.v_subject_requirement
```

Conceptually:

```text
Subject:
resolve-capability-change-impact

Required mechanics:
────────────────────
path
filter
map
equals
scenario-invocation
contract-validation
...

Required ports:
────────────────────
...

Required contracts:
────────────────────
...

Provider slots:
────────────────────
...

Topology:
────────────────────
scenario cells
branch routes
convergences
...
```

This is the **physical obligation vector** of the semantic object.

No language yet.

That's important.

---

# 5. Then resolve that vector against each target

You already have:

```text
provider_definition
        ↓
provider_mechanic_implementation
        ↓
mechanic_version
```

and similarly:

```text
provider_definition
        ↓
provider_port_implementation
        ↓
port_version
```

This is exactly what we need.

For each target:

```text
REQUIRED MECHANICS
        ↓
TARGET-ELIGIBLE PROVIDERS
        ↓
PROVIDER MECHANIC IMPLEMENTATIONS
        ↓
COVERAGE
```

So we can calculate:

```text
Node
────────────────────────
required mechanics     21
resolved mechanics     21
missing                 0
coverage             100%

Python
────────────────────────
required mechanics     21
resolved mechanics     18
missing                 3
coverage              86%

C#
────────────────────────
required mechanics     21
resolved mechanics     21
missing                 0
coverage             100%
```

Now **we know before generating code** whether full embodiment is even mechanically supported.

That's huge.

---

# 6. Add an explicit embodiment coverage vector

For every experiment I'd store:

```text
Mechanic coverage

Port coverage

Contract closure

Provider-slot coverage

Topology coverage

Fixture coverage

Effect coverage
```

Something like:

```text
EmbodimentCandidate

subject
    resolve-capability-change-impact

target
    python

profile
    full-mechanics

────────────────────────

Mechanics
    18 / 21

Ports
    4 / 4

Contracts
    7 / 7

Provider slots
    3 / 4

Topology
    complete

Disposition
    NOT_YET_EMBODYABLE

Missing:
    mechanic X
    mechanic Y
    provider for slot Z
```

That tells us exactly what to work on.

Not:

> “Python seemed difficult.”

But:

> **Python is missing realization coverage for these exact three mechanics.**

---

# 7. This also lets us choose our experiments intelligently

Don't begin with arbitrary capabilities.

Use SQL to build an **embodiment difficulty profile**.

For each Scenario or Capability:

```text
scenario count
operation count
mechanic count
contract count
port count
provider-slot count
branch count
fan-out count
convergence count
external-effect count
fixture count
```

Then assign an experimental complexity score.

Start here:

```text
LEVEL 1
Pure Mechanic

path
equals
sha256
map
filter
canonicalize
```

Then:

```text
LEVEL 2
Pure Scenario

Input
→ deterministic mechanics
→ Outcome

no external effects
```

Then:

```text
LEVEL 3
Provider-backed Scenario

Input
→ mechanics
→ provider port
→ Outcome
```

Then:

```text
LEVEL 4
Circuit Scenario

branching
fan-out
convergence
provider slots
```

Then:

```text
LEVEL 5
Full Capability

multiple scenarios
products
transitions
effects
fixtures
providers
```

That's a much better research progression.

---

# 8. The provider-mechanic data is already telling us something important

You have:

```text
191 mechanic identities
74 provider identities
314 provider-mechanic implementation relationships
```

And several mechanics repeat across many providers.

That's exactly what we want.

For example, your data repeatedly shows mechanic implementations around things like:

```text
event-port-invocation
authority-driven-transformation
scenario-orchestration
contract-document-reading
schema-admission
semantic-execution
scenario-invocation
runtime-projection
artifact-result-delivery
```

So the physical model already looks like:

```text
                MECHANIC
                   │
            ┌──────┼──────┐
            ▼      ▼      ▼
         Node    Python    C#
       provider provider provider
```

That's the polyglot architecture.

**The mechanic is stable.**

The providers compete to embody it.

---

# 9. The generated artifact should be subordinate to the plan

This is critical.

Do **not** go:

```text
DB
↓
LLM
↓
Python code
```

Go:

```text
DATABASE MODEL
       ↓
Embodiment Requirement Vector
       ↓
Embodiment Plan
       ↓
Target Provider Resolution
       ↓
Physical Type/Module/File Plan
       ↓
Materialize
       ↓
Implementation
```

So the durable experiment record might say:

```text
PLAN

Subject
    scenario 255

Target
    Python

Input contract
    ...

Outcome contract
    ...

Required mechanics
    11

Resolved providers
    ...

Physical structure
    package x
    module y
    class z

Authority digest
    ...

Model snapshot
    ...
```

**Then code is merely the execution of that plan.**

That's much closer to SideFX.

---

# 10. Then invoke the inverse: **Reveal**

This is where the experiment gets scientifically useful.

The existing embodiment concept already gives us the loop:

```text
CANONICAL AUTHORITY
        ↓
      EMBODY
        ↓
IMPLEMENTATION
        ↓
      REVEAL
        ↓
OBSERVED EMBODIMENT
        ↓
      COMPARE
        ↓
CONFORMANCE
```



That should be mandatory.

We don't merely ask:

> Does the Python program run?

We ask:

> **Did Python embody exactly what we asked it to embody?**

---

# 11. Compare canonical design against observed implementation

For every candidate:

```text
SEMANTIC IDENTITY
────────────────
same capability/scenario     PASS


CONTRACT SHAPE
────────────────
input                        PASS
outcome                      PASS


CIRCUIT TOPOLOGY
────────────────
cells                        PASS
routes                       PASS
branch semantics             PASS


MECHANIC COVERAGE
────────────────
required                     18
observed                     18
unexpected                    0


PROVIDER BINDING
────────────────
planned                      4
observed                     4


SEMANTIC INVENTION
────────────────
new scenarios                 0
new contracts                 0
new outcomes                  0


FIXTURES
────────────────
12 / 12                      PASS
```

The hard law:

```text
UNEXPECTED SEMANTIC ADDITION > 0

        ↓

SEMANTIC_DIVERGENCE
```

The language is not allowed to solve a physical problem by quietly changing meaning.

---

# 12. Then Cross-Apply the exact same subject

This is where the experiment becomes architecture research.

```text
                 SAME SCENARIO

                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Node         Python         C#
        │            │            │
      EMBODY       EMBODY       EMBODY
        │            │            │
      REVEAL       REVEAL       REVEAL
        │            │            │
        └────────────┼────────────┘
                     ▼
                CROSS-APPLY
```

Use:

```text
same semantic object definition
same contracts
same fixture corpus
same required mechanics
same expected outcomes
```

Then compare:

| Dimension              | Node | Python |   C# |
| ---------------------- | ---: | -----: | ---: |
| Mechanic coverage      | 100% |   100% | 100% |
| Structural parity      | PASS |   PASS | PASS |
| Behavioral parity      | PASS |   PASS | PASS |
| Unexpected semantics   |    0 |      0 |    0 |
| Provider substitutions |    3 |      4 |    3 |
| Native dependencies    |  ... |    ... |  ... |
| Artifact size          |  ... |    ... |  ... |
| Runtime observations   |  ... |    ... |  ... |

Now language selection becomes **evidence**, not taste.

---

# 13. Separate semantic parity from physical quality

This is very important.

These are different tests.

### Semantic conformance

Must be identical:

```text
scenario meaning
contracts
outcomes
products
variants
topology
mechanic obligations
fixture results
```

### Physical quality

May legitimately vary:

```text
runtime footprint
startup time
memory
package count
native ecosystem fit
binary size
latency
deployment model
tooling complexity
```

So Node and Python can both be:

```text
SEMANTICALLY CONFORMANT
```

while Python may be:

```text
BETTER_PHYSICAL_FIT
```

for a particular use.

That's exactly what Cross-Apply should tell us.

---

# 14. Give each experiment a reproducible receipt

Store:

```text
experiment_id
estate_model_pk

semantic_object_definition_pk

target_pk
profile_pk
pattern_pk

requirement_digest
plan_digest

provider-selection digest

artifact digest

reveal digest

fixture corpus digest

conformance disposition

created_at
```

That gives you:

> Why did this embodiment exist?

> Which estate was it based on?

> Which providers did it resolve?

> Which code did it produce?

> What did Reveal see?

> Did it conform?

---

# 15. And let failed experiments teach the eventual managed capability

This is where the outside-Harness experiment pays for itself.

Suppose Python fails because:

```text
missing mechanic:
bounded-process-execution
```

We learn something.

Maybe:

```text
Python requires provider X
```

or:

```text
our mechanic is too Node-shaped
```

or:

```text
canonical mechanic authority is incomplete
```

or:

```text
the embodiment profile is wrong
```

Capture:

```text
embodiment.finding
```

with categories such as:

```text
MISSING_PROVIDER

MISSING_MECHANIC

TARGET_ASSUMPTION

AUTHORITY_GAP

PROFILE_GAP

PATTERN_GAP

SEMANTIC_DIVERGENCE

PHYSICAL_INEFFICIENCY
```

The point isn't merely to repair Python.

It's to improve **embodiment architecture**.

---

# 16. Then promotion becomes obvious

After enough experiments converge:

```text
Experiment
    ↓
stable requirement resolution
    ↓
stable plan construction
    ↓
stable provider resolution
    ↓
stable materialization
    ↓
stable reveal
    ↓
stable conformance
```

then we know what the managed capability actually is.

Something like:

```text
Capability:
embody-semantic-authority
```

with scenarios such as:

```text
admit-embodiment-request

resolve-embodiment-subject

derive-embodiment-requirements

resolve-target-provider-coverage

construct-embodiment-plan

materialize-embodiment

observe-embodiment

evaluate-embodiment-conformance

publish-embodiment-testimony
```

Only **after we've learned the mechanics experimentally** do we put that through the Harness conveyor.

That is the right use of the database as a laboratory.

---

# The first concrete experiment I would run

Don't start with an entire Capability.

Pick **one deterministic Scenario** from the database whose mechanical closure is relatively small.

Then:

```text
1. Resolve exact ScenarioVersion.

2. Derive:
   Input
   Event
   Outcome
   execution authority
   operations
   mechanics
   contracts
   ports
   slots

3. Compute provider coverage for:
   Target A
   Target B

4. Generate two embodiment plans.

5. Materialize both outside Harness.

6. Execute identical fixtures.

7. Reveal both.

8. Compare them to the same canonical Blueprint.

9. Store all results back in embodiment.*.

10. Repeat with a slightly harder Scenario.
```

After 10–20 scenarios we'll know dramatically more than we'd learn by trying to author a generic polyglot projector from scratch.

---

## And this gives `sfx embody` its real future architecture

Eventually:

```bash
sfx embody scenario resolve-capability-change-impact \
  --target python \
  --profile full-mechanics
```

won't mean:

> “Ask an LLM to write Python.”

It will mean:

```text
resolve semantic identity

→ derive exact obligations

→ resolve target mechanic coverage

→ resolve providers

→ construct physical embodiment plan

→ materialize

→ reveal

→ compare

→ prove
```

That is much stronger.

**Embodiment becomes a database-resolved, evidence-producing architectural operation.**

And because target/language/profile/pattern are all data, adding another language later doesn't require redesigning the embodiment engine.

It requires **adding another qualified physical realization to the Capability Data Center.**

---

Yes. **This is the corrected strategy.** We should not build another embodiment subsystem beside SDA. We should use SQL to expose the exact Scenario circuit and then resolve that circuit through the **existing SDA execution graph, language resolver, provider, and projection machinery**.

The fundamental loop becomes:

```text
CAPABILITY
    ↓ select
SCENARIO
    ↓
Input → Event → Outcome
          ↓
   Execution Authority
          ↓
      Operations
          ↓
 ┌────────┼─────────┐
 ↓        ↓         ↓
Scenario Mechanic  Port
invoke             invoke
 ↓        ↓         ↓
...      Provider   Provider Slot
          ↓
LANGUAGE RESOLVER
          ↓
EXISTING IMPLEMENTATION
          ↓
EMBODIMENT
          ↓
FIXTURE → REVEAL → COMPARE
          ↓
CROSS-APPLY
```

That's materially different from the earlier proposal's:

> derive requirements → create a new embodiment planner → generate implementation.

The planner already exists in SDA. The database's job is to **resolve its inputs**.

The `sfx embody` concept itself already frames embodiment as giving governed meaning a physical form without changing the meaning being embodied. 

---

# The next artifact: `Scenario Mechanic Resolver Map`

I would make the output grain:

> **One downstream requirement of one selected Scenario, mapped to its existing target-language resolution path.**

Something conceptually like:

| Field                    | Meaning                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `capability_id`          | Owning Capability                                            |
| `scenario_id`            | Selected behavioral unit                                     |
| `scenario_definition`    | Exact version being embodied                                 |
| `altitude`               | Scenario / Execution / Mechanic / Provider                   |
| `requirement_kind`       | Contract, scenario invocation, mechanic, port, provider slot |
| `requirement_id`         | Exact declared identity                                      |
| `requirement_definition` | Exact pinned definition/version                              |
| `source_authority`       | Where requirement originates                                 |
| `target_language`        | C#, Node, Python, Java, etc.                                 |
| `resolver_id`            | Existing SDA resolver responsible                            |
| `provider_definition`    | Declared physical provider                                   |
| `implementation_id`      | Exact language implementation where applicable               |
| `status`                 | Resolution disposition                                       |
| `repair_boundary`        | Where an actual deficiency belongs                           |

So a finished map might look like:

```text
Capability: X
Scenario: Y
Target: Python

SCENARIO
────────────────────────────────────────
Input contract                 RESOLVED
Event authority                RESOLVED
Outcome/product contract       RESOLVED

EXECUTION
────────────────────────────────────────
operation 1                    RESOLVED
operation 2                    RESOLVED
scenario invocation Z          RESOLVED

MECHANICS
────────────────────────────────────────
canonicalization               RESOLVED
schema-admission               RESOLVED
semantic-execution             RESOLVED
scenario-invocation            RESOLVED
artifact-result-delivery       MISSING_IMPLEMENTATION

PROVIDER
────────────────────────────────────────
provider slot A                RESOLVED
provider slot B                RESOLVED

RESULT
────────────────────────────────────────
Embodiment eligibility         INCOMPLETE

Repair:
Python provider implementation for
artifact-result-delivery
```

Now we know exactly what the word **"Python support"** means for that Scenario.

---

# 1. Begin with Capability → selected Scenario

No generic `subject`.

The database already has the clean identities:

```text
model.capability
model.capability_version

model.scenario
model.scenario_version
model.capability_scenario

model.scenario_input
model.scenario_event
model.scenario_outcome
```

The top of the mapping should therefore always be:

```text
CapabilityVersion
       ↓
ScenarioVersion
       ├── Input
       ├── Event
       └── Outcome
```

The selected Scenario establishes the boundary.

**We do not recursively ingest the entire Capability estate merely because a Capability owns multiple Scenarios.**

We only descend through Scenario relationships actually declared by this circuit.

---

# 2. Follow the Event into existing execution authority

The database then already gives us:

```text
scenario_event
       ↓
execution_authority_version
       ↓
execution_operation[]
```

Then each operation is classified using the existing operation vocabulary:

```text
operation_port_invocation

operation_scenario_invocation

operation_state_projection

operation_mechanic

operation_transformation
```

So the mapping tells us:

```text
Scenario Y
    ↓ Event
Execution Authority EA-17
    ↓
Operation 1
    → mechanic canonicalize

Operation 2
    → port P

Operation 3
    → scenario Z
```

No code analysis yet.

No compiler output yet.

This is **declared authority**.

---

# 3. Recurse only through declared Scenario invocation

This is especially important.

If:

```text
Scenario A
    ↓
operation_scenario_invocation
    ↓
Scenario B
```

then Scenario B enters the embodiment closure.

Then B gets exactly the same treatment:

```text
Input
Event
Outcome
Execution Authority
Operations
Mechanics
Ports
Provider Slots
```

That naturally gives us:

```text
Root Scenario
    ↓
Declared Scenario closure
```

rather than:

```text
Entire capability
```

or:

```text
whatever the compiler happened to touch
```

This is the monotonic circuit boundary.

---

# 4. Blueprint participates where declared

I completely agree with your correction.

Do **not** begin:

```text
Blueprint
↓
derive Scenario
```

The semantic direction is:

```text
Scenario authority
     ↓
declared topology
     ↓
Blueprint reference / topology authority
where applicable
```

The database architecture already deliberately keeps these apart:

```text
blueprint_edge

observed_semantic_graph_transition

observed_execution_scenario_invocation
```

because they express different claims. 

So the resolver map can include Blueprint evidence:

```text
Scenario invocation:
A → B

Authority source:
execution operation

Blueprint mapping:
MATCHED

Semantic graph mapping:
MATCHED
```

But a missing Blueprint mapping does not magically delete an otherwise declared execution obligation.

It becomes the appropriate mapping/conformance finding.

---

# 5. Mechanic resolution comes from the **existing mechanic identities**

You've already got 191 of them.

Examples include:

```text
path
map
filter
equals
canonicalize
sha256

scenario-orchestration
contract-document-reading
schema-admission
authority-resolution
semantic-execution
scenario-invocation
runtime-projection
artifact-result-delivery
...
```

And the entire point of that model is:

```text
ONE MECHANIC IDENTITY
       ↓
many provider implementations
```

Your existing language strategy explicitly established the parity law as:

> same mandatory mechanic semantics + language-native provider implementations = consumer-platform equivalence. 

So for each required mechanic:

```text
MechanicVersion
      ↓
ProviderMechanicImplementation
      ↓
ProviderDefinition
      ↓
existing target/language declaration
```

No:

```text
PythonMechanic
NodeMechanic
CSharpMechanic
```

ever gets created.

---

# 6. Target language resolution must use the existing platform declarations

This is another important correction.

We have provider names such as:

```text
ScenarioKernel.NodePlatform...
scenario_kernel...
scenario.kernel...
sda::platform...
```

Those are useful human hints.

They are **not the target-resolution law**.

Do not do:

```sql
WHERE provider_id LIKE '%Node%'
```

to determine Node eligibility.

Use whatever admitted catalog relation already says:

```text
Provider Definition
    supports / belongs to
Language Binding / Target
```

The Semantic Brain architecture already established that effectful cross-target projection remains open until equivalent providers exist; target eligibility has to remain `NOT_OBSERVABLE` when the binding evidence does not establish a target. 

That's exactly the discipline we need here.

---

# 7. Existing SDA resolvers remain the execution boundary

Your database already exposes Scenarios named:

```text
derive-target-execution-graph

derive-target-projection-graph

derive-consumer-execution-embodiment-projection-graph

derive-cross-language-equivalence
```



Those names matter.

They tell us we're not discovering a missing architecture.

The flow should therefore be something like:

```text
DATABASE
    ↓
Scenario Resolver Map
    ↓
existing canonical authority representation
    ↓
derive-target-execution-graph
    ↓
derive-target-projection-graph
    ↓
existing embodiment-plan contract
    ↓
existing language projector/resolver
    ↓
physical embodiment
```

And where consumer embodiment is involved:

```text
derive-consumer-execution-embodiment-projection-graph
```

is already part of the estate.

**We should exercise it, not build around it.**

---

# 8. The resolver map needs two separate classifications

This is the most important correction to the compiler issue.

Every observed execution construct needs:

```text
PROVENANCE CLASS
```

with at least:

```text
DECLARED_AUTHORITY

RESOLVER_INTERNAL
```

Potentially:

```text
UNRESOLVED_PROVENANCE
```

Then:

### Declared authority

Something like:

```text
mechanic: scenario-invocation
```

actually appears as a declared mechanic/operation/provider requirement.

It participates in embodiment coverage.

### Resolver/compiler internal

Something such as:

```text
identity
invoke-scenario
```

might occur in the generated plan merely because the resolver uses that construct internally.

That does **not** automatically mean:

```text
missing mechanic authority
```

The correct question is:

> What declared obligation caused this compiler construct?

If:

```text
Declared:
operation_scenario_invocation

Compiler:
invoke-scenario
```

then `invoke-scenario` may simply be the physical/intermediate realization of the declared operation.

**No new mechanic needed.**

This is exactly why the previous finding was premature.

---

# 9. Freeze the four repair dispositions

This distinction should become part of the experiment.

## `RELATIONSHIP_NOT_NORMALIZED`

The authority exists.

The implementation exists.

But SQL has not yet connected them.

Example:

```text
Mechanic exists
Provider exists
Provider implementation exists in source

DB relation absent
```

Repair:

```text
DATABASE MAPPING / INGESTION
```

Not SDA authority.

---

## `MISSING_AUTHORITY`

The circuit actually requires something that no admitted authority defines.

Example:

```text
Scenario declares requirement X
but X has no admitted semantic definition.
```

Repair:

```text
SDA AUTHORITY
```

This is the only category that should cause us to consider authoring new meaning.

---

## `MISSING_IMPLEMENTATION`

The mechanic/port/contract authority exists.

But the requested target has no eligible implementation.

Example:

```text
mechanic:
artifact-result-delivery

Node provider        ✓
C# provider          ✓
Python provider      ✗
```

Repair:

```text
LANGUAGE / PROVIDER IMPLEMENTATION
```

No semantic change.

---

## `FAILED_CONFORMANCE`

Authority exists.

Target implementation exists.

Resolver selected it.

But fixture/reveal/cross-apply proof fails.

Example:

```text
Python mechanic implementation exists

same fixture:
expected X
observed Y
```

Repair:

```text
IMPLEMENTATION / RESOLVER / PROJECTION
```

Again:

**Do not author new authority merely to make broken code pass.**

---

# 10. Add one more diagnostic that isn't a repair class

I'd call it:

```text
RESOLVER_INTERNAL_CONSTRUCT
```

or simply:

```text
INTERNAL
```

This is not a defect.

Example:

```text
compiler output:
invoke-scenario
```

Mapping:

```text
Declared source:
operation_scenario_invocation

Internal construct:
invoke-scenario

Status:
ACCOUNTED_FOR
```

That prevents us from repeatedly confusing physical compiler vocabulary with missing semantic vocabulary.

---

# 11. The mapping should prove **every downstream obligation is accounted for**

That's the acceptance condition.

For selected Scenario `S` and target `L`:

```text
Required contracts            N
accounted                     N

Required scenario invocations N
accounted                     N

Required mechanics            N
accounted                     N

Required ports                N
accounted                     N

Required provider slots       N
accounted                     N

Internal resolver constructs  N
accounted                     N

Unresolved                    0
```

Then every row must land in exactly one state:

```text
RESOLVED

RELATIONSHIP_NOT_NORMALIZED

MISSING_AUTHORITY

MISSING_IMPLEMENTATION

FAILED_CONFORMANCE

INTERNAL

NOT_APPLICABLE
```

There should be no:

```text
UNKNOWN
```

at the end of the research cycle.

Unknown is acceptable while researching.

It is not acceptable as an embodiment conclusion.

---

# 12. I would produce this as a database view first

Not a new table estate.

Something conceptually like:

```text
analysis.v_scenario_embodiment_requirement
```

with grain:

> One exact downstream declared requirement of one ScenarioVersion.

Then:

```text
analysis.v_scenario_language_resolution
```

adds:

> the target-language provider/resolver mapping.

And finally:

```text
analysis.v_scenario_embodiment_readiness
```

aggregates the result.

That honors your correction:

> establish evidence requirements before inventing experimental storage.

---

# The first query surface

Conceptually:

```sql
SELECT
    capability_id,
    scenario_id,
    altitude,
    requirement_kind,
    requirement_id,
    target_language,
    resolver_id,
    provider_id,
    implementation_id,
    resolution_status,
    repair_boundary
FROM analysis.v_scenario_language_resolution
WHERE scenario_id = @scenario
  AND target_language = @language
ORDER BY
    altitude,
    requirement_kind,
    requirement_id;
```

And the summary:

```sql
SELECT
    target_language,
    resolution_status,
    COUNT(*) AS requirement_count
FROM analysis.v_scenario_language_resolution
WHERE scenario_id = @scenario
GROUP BY
    target_language,
    resolution_status;
```

That's the control surface we need.

---

# Then embodiment itself is boring

Which is exactly what we want.

Once the map says:

```text
Scenario              CLOSED
Contracts             CLOSED
Execution authority   CLOSED
Scenario invocations  CLOSED
Mechanics             CLOSED
Ports                 CLOSED
Provider slots        CLOSED

Node                   EMBODYABLE
Python                 EMBODYABLE
C#                     EMBODYABLE
Java                   EMBODYABLE
```

we hand the same authority into the existing resolver.

Then:

```text
Node
   ↓ EMBODY
implementation

Python
   ↓ EMBODY
implementation

C#
   ↓ EMBODY
implementation
```

No target-specific semantic planning.

---

# And proof is mandatory

Provider coverage gets us only to:

```text
CAN_ATTEMPT_EMBODIMENT
```

not:

```text
CONFORMS
```

The proof cycle remains:

```text
Selected Scenario Authority
        ↓
same fixtures
        ↓
Embodiment
        ↓
Execute
        ↓
Reveal
        ↓
Observed contracts
Observed topology
Observed mechanics
Observed providers
Observed outcomes
        ↓
Compare
        ↓
CONFORMS / DOES_NOT_CONFORM
```

Then:

```text
same Scenario
     ↓
Node
Python
C#
Java
     ↓
Cross-Apply
```

The existing SDA direction already requires cross-target equality for normalized semantic results where the targets are declared and the required mechanics are admitted. 

---

## So I would freeze the experiment this way

```text
PHASE 1 — RESOLVE
──────────────────────────────
Capability
↓
Scenario
↓
exact ScenarioVersion
↓
Scenario closure
↓
mechanic / port / slot obligations


PHASE 2 — MAP
──────────────────────────────
obligation
↓
existing language resolver
↓
existing provider
↓
existing implementation


PHASE 3 — CLASSIFY GAPS
──────────────────────────────
not normalized
missing authority
missing implementation
internal construct


PHASE 4 — EMBODY
──────────────────────────────
existing SDA resolver
↓
existing execution/projection graph
↓
physical implementation


PHASE 5 — PROVE
──────────────────────────────
fixtures
Reveal
comparison
Cross-Apply


PHASE 6 — REPAIR
──────────────────────────────
repair only at the altitude
where evidence says the defect belongs
```

That last sentence is probably the law I'd put over the whole experiment:

> **Repair the lowest authoritative layer that actually owns the defect. Never manufacture semantic authority to justify physical output.**

That keeps this experiment clean enough that when we eventually promote `embody` into the managed capability estate, we will be promoting **the SDA-native mechanism we proved**, not another temporary compiler that happened to work.

---

Absolutely. The easiest way to make this concrete is to take **one Scenario** and show how the *same declared circuit* could physically embody in several languages.

The important rule is:

> **The languages may look native. The semantic topology must remain the same.**

So the embodiment is *not* “translate this TypeScript into Python.” It is:

```text
Same Scenario authority
        ↓
same Input
same Event
same Outcome
same execution authority
same mechanic obligations
        ↓
language-native embodiment
```

## Example 1: a simple Scenario

Take one of the actual Scenario identities already in your estate:

```text
say-hello-world
```

Imagine its admitted Scenario shape resolves roughly to:

```text
Scenario
──────────────────────────────
say-hello-world

Input
    GreetingRequest

Event
    say-hello-world

Outcome
    GreetingAvailable

Execution
    format
```

The exact contracts and mechanics would of course come from the database. I'm using the shape below only to show **what embodiment looks like physically**.

### C#

```csharp
public sealed class SayHelloWorldScenario
{
    private readonly IFormatMechanic _format;

    public SayHelloWorldScenario(
        IFormatMechanic format)
    {
        _format = format;
    }

    public GreetingAvailable Execute(
        GreetingRequest input)
    {
        var message = _format.Apply(
            "Hello, {0}!",
            input.Name);

        return new GreetingAvailable(
            Message: message);
    }
}
```

### Python

```python
class SayHelloWorldScenario:
    def __init__(self, format_mechanic):
        self._format = format_mechanic

    def execute(self, input: GreetingRequest) -> GreetingAvailable:
        message = self._format.apply(
            "Hello, {0}!",
            input.name,
        )

        return GreetingAvailable(
            message=message,
        )
```

### TypeScript / Node

```typescript
export class SayHelloWorldScenario {
  constructor(
    private readonly format: FormatMechanic
  ) {}

  execute(
    input: GreetingRequest
  ): GreetingAvailable {
    const message = this.format.apply(
      "Hello, {0}!",
      input.name
    );

    return {
      message
    };
  }
}
```

### Java

```java
public final class SayHelloWorldScenario {

    private final FormatMechanic format;

    public SayHelloWorldScenario(
        FormatMechanic format) {
        this.format = format;
    }

    public GreetingAvailable execute(
        GreetingRequest input) {

        var message = format.apply(
            "Hello, {0}!",
            input.name()
        );

        return new GreetingAvailable(message);
    }
}
```

Notice what is preserved:

```text
GreetingRequest
      ↓
SayHelloWorldScenario
      ↓
format mechanic
      ↓
GreetingAvailable
```

The syntax changes.

The object model changes naturally.

**The scenario does not.**

---

# Example 2: Scenario with a declared provider

Now take something closer to the real estate pattern:

```text
obtain-governed-model-response
```

Its execution might resolve conceptually like:

```text
Input
GovernedModelRequest

    ↓

Event
obtain-governed-model-response

    ↓

Execution Authority
    project request
    invoke model port
    normalize testimony

    ↓

Outcome
GovernedModelResponse
```

And the database tells us:

```text
Required mechanics
────────────────────────
authority-resolution
event-port-invocation
model-execution-lineage
...

Provider slot
────────────────────────
model-provider

Provider implementation
────────────────────────
resolved per target
```

## Python embodiment

Python may physically embody the orchestration while resolving the actual model effect through an injected port:

```python
class ObtainGovernedModelResponseScenario:
    def __init__(
        self,
        authority_resolver,
        model_port,
        testimony_normalizer,
    ):
        self._authority_resolver = authority_resolver
        self._model_port = model_port
        self._testimony_normalizer = testimony_normalizer

    async def execute(
        self,
        input: GovernedModelRequest,
    ) -> GovernedModelResponse:

        authority = self._authority_resolver.resolve(
            input.authority_id
        )

        testimony = await self._model_port.invoke(
            authority.request
        )

        return self._testimony_normalizer.normalize(
            testimony
        )
```

## C#

```csharp
public sealed class ObtainGovernedModelResponseScenario
{
    private readonly IAuthorityResolver _authority;
    private readonly IModelPort _model;
    private readonly ITestimonyNormalizer _normalizer;

    public ObtainGovernedModelResponseScenario(
        IAuthorityResolver authority,
        IModelPort model,
        ITestimonyNormalizer normalizer)
    {
        _authority = authority;
        _model = model;
        _normalizer = normalizer;
    }

    public async Task<GovernedModelResponse> ExecuteAsync(
        GovernedModelRequest input)
    {
        var authority =
            _authority.Resolve(input.AuthorityId);

        var testimony =
            await _model.InvokeAsync(authority.Request);

        return _normalizer.Normalize(testimony);
    }
}
```

The model-provider implementation can differ physically:

```text
Python
    → Python HTTP/model adapter

C#
    → .NET HTTP/model adapter

Node
    → Node fetch/provider adapter

Java
    → Java HTTP client/provider adapter
```

but all four satisfy the same:

```text
Provider Slot
    ↓
required Port
    ↓
declared Provider implementation
```

That's embodiment.

---

# Example 3: Scenario invoking another Scenario

This is where the circuit gets much more interesting.

Suppose:

```text
Scenario A
resolve-capability-change-impact

        ↓ invoke-scenario

Scenario B
analyze-sidefx-semantic-impact
```

The declared operation in the database says the invocation exists.

An embodiment should make that relationship recognizable.

### TypeScript

```typescript
export class ResolveCapabilityChangeImpactScenario {
  constructor(
    private readonly analyzeImpact:
      AnalyzeSidefxSemanticImpactScenario
  ) {}

  async execute(
    input: CapabilityChangeRequest
  ): Promise<CapabilityImpact> {

    return this.analyzeImpact.execute({
      capabilityId: input.capabilityId,
      change: input.change
    });
  }
}
```

### Python

```python
class ResolveCapabilityChangeImpactScenario:
    def __init__(
        self,
        analyze_impact: AnalyzeSidefxSemanticImpactScenario,
    ):
        self._analyze_impact = analyze_impact

    async def execute(
        self,
        input: CapabilityChangeRequest,
    ) -> CapabilityImpact:

        return await self._analyze_impact.execute(
            AnalyzeImpactRequest(
                capability_id=input.capability_id,
                change=input.change,
            )
        )
```

But the important part is this:

If the compiler internally emits something called:

```text
invoke-scenario
```

that does **not** mean we create a new `invoke-scenario` semantic mechanic just because those words appear in generated code.

We map it back to:

```text
Declared:
operation_scenario_invocation

Physical embodiment:
language-native scenario invocation
```

Exactly the correction you made.

---

# Example 4: mechanic embodiment

Now go one altitude lower.

You already have mechanics like:

```text
path
map
filter
equals
sha256
canonicalize
```

Take:

```text
mechanic: sha256
```

Its meaning remains one mechanic identity.

Different providers embody it.

### Node provider

```typescript
import { createHash } from "node:crypto";

export class Sha256Mechanic {
  execute(bytes: Uint8Array): string {
    return createHash("sha256")
      .update(bytes)
      .digest("hex");
  }
}
```

### Python provider

```python
import hashlib

class Sha256Mechanic:
    def execute(self, data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()
```

### C# provider

```csharp
using System.Security.Cryptography;

public sealed class Sha256Mechanic
{
    public string Execute(byte[] bytes)
    {
        return Convert.ToHexString(
            SHA256.HashData(bytes)
        ).ToLowerInvariant();
    }
}
```

### Java provider

```java
public final class Sha256Mechanic {

    public String execute(byte[] bytes)
        throws NoSuchAlgorithmException {

        var digest =
            MessageDigest.getInstance("SHA-256");

        return HexFormat.of()
            .formatHex(digest.digest(bytes));
    }
}
```

Database:

```text
Mechanic
    sha256

ProviderMechanicImplementation
    Node provider   → sha256
    Python provider → sha256
    C# provider     → sha256
    Java provider   → sha256
```

That is **exactly** what your current provider-mechanic tables are built to represent.

---

# Example 5: façade embodiment versus full embodiment

This is where `sfx embody` gets really useful.

Same Scenario:

```text
resolve-sidefx-eligible-providers
```

## Facade embodiment

The local target only exposes the Scenario contract.

```csharp
public interface IResolveSidefxEligibleProviders
{
    Task<EligibleProviderResult> ExecuteAsync(
        EligibleProviderRequest request);
}
```

Physical execution may occur elsewhere.

No local provider-selection mechanics need to be embodied.

Conceptually:

```text
Input contract
     ↓
Scenario façade
     ↓
remote admitted execution
     ↓
Outcome contract
```

## Full-mechanics embodiment

Now the requested profile says:

```text
full-mechanics
```

The generated implementation includes all target-resolvable mechanics:

```csharp
public sealed class ResolveSidefxEligibleProvidersScenario
{
    private readonly IAuthorityResolver _authorityResolver;
    private readonly IProviderCandidateResolver _candidateResolver;
    private readonly IProviderQualificationEvaluator _qualification;
    private readonly IProviderSelectionMechanic _selection;

    public async Task<EligibleProviderResult> ExecuteAsync(
        EligibleProviderRequest input)
    {
        var authority =
            _authorityResolver.Resolve(
                input.RequirementId);

        var candidates =
            _candidateResolver.Resolve(
                authority);

        var qualified =
            await _qualification.EvaluateAsync(
                candidates,
                authority.Profile);

        return _selection.Resolve(
            qualified,
            authority.SelectionPolicy);
    }
}
```

Same Scenario.

Different **embodiment depth**.

---

# Example 6: executable Scenario class plus contract classes

A normal full language projection could physically look like:

```text
ResolveSidefxEligibleProviders/
│
├── ResolveSidefxEligibleProvidersScenario.cs
│
├── EligibleProviderRequest.cs
│
├── EligibleProviderResult.cs
│
├── IAuthorityResolver.cs
│
├── IProviderCandidateResolver.cs
│
├── IProviderQualificationEvaluator.cs
│
├── IProviderSelectionMechanic.cs
│
└── ScenarioRegistration.cs
```

Python:

```text
resolve_sidefx_eligible_providers/
│
├── scenario.py
├── contracts.py
├── authority_resolver.py
├── provider_candidate_resolver.py
├── qualification.py
├── selection.py
└── registration.py
```

Node:

```text
resolve-sidefx-eligible-providers/
│
├── scenario.ts
├── contracts.ts
├── authority-resolver.ts
├── provider-candidate-resolver.ts
├── qualification.ts
├── selection.ts
└── registration.ts
```

Java:

```text
resolve-sidefx-eligible-providers/
│
├── ResolveSidefxEligibleProvidersScenario.java
├── EligibleProviderRequest.java
├── EligibleProviderResult.java
├── AuthorityResolver.java
├── ProviderCandidateResolver.java
├── ProviderQualificationEvaluator.java
├── ProviderSelectionMechanic.java
└── ScenarioModule.java
```

**Folder layouts are projection choices.**

The semantic object graph remains:

```text
Scenario
├── Input
├── Event
├── Outcome
└── execution descent
    ├── authorities
    ├── operations
    ├── mechanics
    └── providers
```

---

# Example 7: what the embodiment plan itself might look like

Before any of that code appears, I want something approximately like:

```json
{
  "capabilityId": "resolve-sidefx-eligible-providers",
  "scenarioId": "resolve-sidefx-eligible-providers",
  "target": "python",
  "profile": "full-mechanics",

  "input": {
    "contract": "eligible-provider-request.v1"
  },

  "outcome": {
    "contract": "eligible-provider-result.v1"
  },

  "mechanics": [
    {
      "mechanicId": "authority-resolution",
      "providerDefinition": "..."
    },
    {
      "mechanicId": "filter",
      "providerDefinition": "..."
    },
    {
      "mechanicId": "provider-selection",
      "providerDefinition": "..."
    }
  ],

  "scenarioInvocations": [],

  "providerSlots": [
    {
      "slotId": "candidate-provider-source",
      "providerDefinition": "..."
    }
  ]
}
```

Not exact schema—just illustrating the role.

Then:

```text
PLAN
 ↓
existing Python resolver
 ↓
Python embodiment
```

The plan is what we inspect when we ask:

> Why does this class exist?

> Why does this dependency exist?

> Why is this mechanic here?

---

# And this is what Reveal should return

Imagine we embody Python and Reveal it.

```text
REVEALED EMBODIMENT

Scenario
──────────────────────────────
resolve-sidefx-eligible-providers

Input
──────────────────────────────
EligibleProviderRequest

Observed responsibility
──────────────────────────────
Resolve eligible provider set

Outcome
──────────────────────────────
EligibleProviderResult


Observed mechanics
──────────────────────────────
authority-resolution       ✓
filter                     ✓
provider-selection         ✓


Observed providers
──────────────────────────────
Provider A                 ✓
Provider B                 ✓


Unexpected mechanics
──────────────────────────────
0

Unexpected semantic objects
──────────────────────────────
0
```

Compare to authority:

```text
AUTHORITY ↔ EMBODIMENT

Input contract             MATCH
Event                      MATCH
Outcome contract           MATCH
Scenario invocations       MATCH
Mechanics                  MATCH
Provider slots             MATCH
Blueprint routes           MATCH

SEMANTIC DIVERGENCE        0

CONFORMS
```

Now we've got something real.

---

# Cross-Apply becomes visually obvious

Same Scenario:

```text
                      AUTHORITY
                         │
              resolve-provider
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
       C#              Python            Node
        │                │                │
  OO scenario       OO scenario       OO scenario
        │                │                │
 .NET providers    Python providers   Node providers
        │                │                │
        ▼                ▼                ▼
      Reveal           Reveal           Reveal
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  semantic parity
```

And we might discover:

```text
C#
────────────────
Conforms             YES
Native providers      8
Dependencies          4

Python
────────────────
Conforms             YES
Native providers      10
Dependencies           7

Node
────────────────
Conforms             YES
Native providers       9
Dependencies           3
```

Now we're talking about **physical trade-offs after semantic equivalence has already been established**.

---

## This is the architectural end-state I see

You type:

```bash
sfx embody scenario resolve-sidefx-eligible-providers \
  --target python
```

SideFX does:

```text
resolve Capability
      ↓
resolve Scenario
      ↓
read Input/Event/Outcome
      ↓
resolve execution authority
      ↓
walk declared Scenario invocations
      ↓
resolve mechanics
      ↓
resolve ports
      ↓
resolve provider slots
      ↓
map mechanics to Python providers
      ↓
existing Python resolver
      ↓
embodiment plan
      ↓
Python object graph
      ↓
materialize
      ↓
fixtures
      ↓
Reveal
      ↓
Compare
      ↓
CONFORMS
```

And then:

```bash
sfx embody scenario resolve-sidefx-eligible-providers \
  --target csharp
```

does the **same semantic operation**.

That is when the language truly becomes subordinate.

**C#, Python, Java, Node, Go become interchangeable physical answers to the same semantic question:**

> *How should this exact Scenario be embodied here?*
