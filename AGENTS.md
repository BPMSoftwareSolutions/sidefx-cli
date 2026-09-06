# SideFX CLI contribution rules

## Entity Neutrality

The [Entity Neutrality Law](docs/command-model.md#entity-neutrality-law) is an
architecture invariant for this repository. Provider Neutrality is one case of it.

- Keep the canonical grammar `sfx <object> <operation> [identity]`. New entity
  instances, business domains, vendors, languages and transports are data; they
  do not add commands, flags or dispatch branches.
- Let the declared entity type and operation select the representation or
  capability boundary. Preserve that type through execution and evidence; never
  reclassify a typed request from the spelling of its identity or payload.
- Obtain meaning, input/event/outcome relationships, contracts and dispositions
  from the selected canonical authority. Preserve explicit unavailable/held results.
  Never substitute another entity kind or manufacture missing authority.
- Put entity-specific values in canonical input/configuration data. CLI and SDK
  commands share a closed request envelope. Object-scoped routes contain explicit
  bindings, not domain logic, runtime-selection rules or admission policy.
- Add entity types or operations only with a defined shared contract and an
  implemented representation or explicit managed delegation boundary. Maintain
  `src/commands.mjs`, the command documentation and regression coverage together.
  Do not generate instance-specific syntax from provider metadata or model output.
- Preserve the working Node interface and documented compatibility forms. Runtime
  eligibility follows required profiles and admitted provider evidence, not the
  implementation language of this CLI.
- The CLI package contains no provider implementation, vendor configuration or
  capability-specific contract dispatch. Resolve targets through estate entity
  metadata or explicit bindings. Forward command and canonical input unchanged
  through the shared invocation protocol; providers own their input interpretation.

Run `npm test` for changes to commands, routing, dispatch or representations.
The entity-neutrality suite must remain part of that command and CI. When changing
the runtime boundary, also run the relevant estate integration checks; report
which surfaces and authority were actually exercised. Do not claim enforcement
in other interfaces merely because this repository's tests pass.

## CLI acceptance

When the user asks to test through `sfx`, execute the `sfx` CLI and retain its
exact command, exit status and native result. A missing capability binding or
unresolved provider mechanic is a blocked CLI test. Direct HTTP requests,
PowerShell probes, SDK calls and fixture proofs do not satisfy that request.
Report the missing capability explicitly and repair it through the appropriate
capability boundary; do not substitute a separate client or embed its behavior
in the CLI. Only provide a command as working after that command has been exercised.
