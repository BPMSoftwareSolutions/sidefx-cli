# Verification — September 6, 2026

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

Windows blocked renaming the open original workspace. Automatic approval review
then rejected the move-and-cleanup command with `blocked by policy`; that command
did not run. The completed transfer used a verified copy instead, so
`C:\lab\repos\sidefx-verbs` remains as the original snapshot. Open
`C:\lab\repos\sidefx-cli` as the workspace for subsequent development. Removing
the original directory and updating the desktop app's saved workspace remain
outstanding. No commit or push was performed.
