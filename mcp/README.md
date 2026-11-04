# Read-only MCP feasibility slice

Experimental implementation of the TypeScript/stdin-stdout direction in proposed
ADR-0007. This does not ratify that ADR or implement hardware authorisation.

## Reproduce

Node 24.x (validated: 24.22.1) and npm (validated: 11.9.0):

```sh
cd mcp
npm ci
npm run build
npm test
```

Dependency versions are exact and the npm lockfile includes integrity hashes.
SDK 1.32.2 declares Node >=18; Node 24 is the deliberately narrow prototype
runtime selection, not a release support matrix. TypeScript 7.0.2, Zod 4.6.7,
tsx 4.23.15 and @types/node 24.19.2 are pinned for this experiment.

Start directly with `node dist/server.js` after building. It communicates using
MCP over stdin/stdout; do not expect a human prompt or a network listener. Logs
must go to stderr. Use `node` directly for MCP configuration, rather than
`npm start`, whose banner would contaminate protocol stdout.

This prototype is not auto-registered with the plugin. For manual client testing,
a stdio server configuration uses `command: "node"` and an `args` array containing
the absolute path to `mcp/dist/server.js`. Build before starting it. Packaged
plugin registration, installation lifecycle and Windows distribution remain open.

## Tool contract

`inspect_capability({ profileId, capability })` is the only tool. Both fields
are nonempty strings of at most 100 characters; additional fields are rejected.
It returns a runtime-validated result with a status, reason, simulation evidence
class and `hardwareAuthorized: false`.

- `simulated-p4-c5` / `local_build`: simulated lookup only; no build is executed.
- Unknown profile: `not_verified` / `UNKNOWN_PROFILE`.
- `kodeos_install` or `standalone_flash` on the fixture: `refused` /
  `SIMULATION_CANNOT_AUTHORIZE_HARDWARE`.
- Unknown capability on the fixture: `unsupported` / `UNKNOWN_CAPABILITY`.

The fixture is not a production profile. Caller-provided approvals/evidence cannot
upgrade it. No filesystem, subprocess, serial, network or device operation is
available through the tool. This limited API is not an OS sandbox: arbitrary
shell access remains outside its scope.

## Validation evidence and limits

Six tests exercise the pure lookup and an independent SDK client against a real
compiled stdio child process, including malformed requests, absent write tools
and shutdown. The cloud's restricted shell sandbox caused Node child processes
to exit without running tests/server code; full test execution used the supported
sandbox escalation and confirmed **six individual tests**, not a zero-test or
file-only result. No assertion was weakened to accommodate that restriction.

Windows, interactive Claude Code discovery and real hardware remain untested.
No SDK, loader or production capability claim follows from these tests. Keep
CK-R001 open. The next policy spike should add claim provenance, invalidation and
explicit production-profile schemas only after the relevant policy review.
