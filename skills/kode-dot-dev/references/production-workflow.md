# Production workflow and evidence

## Claim record

For each consequential claim, record: claim ID, exact statement, primary source
URL and revision/hash, retrieval date, board/module revision, processor,
bootloader/kodeOS version, evidence class, conflicts and retest trigger.

Keep these distinctions:

- Advertised: a manufacturer product claim.
- Documented: a scoped specification or supported procedure.
- Source-verified: the identified source actually implements the claimed behavior.
- Physically observed: an identified production device demonstrated it under
  recorded conditions; record artefact hashes and the test procedure.
- Unknown, conflicting or stale: unresolved evidence; not permission to proceed.

Do not promote all claims in a profile because one peripheral was tested.
Invalidate affected evidence after board, module, firmware or loader changes.
Manual module selection does not prove identity or electrical compatibility.

## Examples

**“What pins does the production Camera module use?”**
Read CK-R001 and look for a revision-specific production pin map. An S3 camera
page is historical evidence only. Report missing production information rather
than copying that pin table.

**“Build a P4 sample.”**
Identify an official sample, supported ESP-IDF revision and dependency licences.
Build locally without invoking device tools. Record source/dependency versions
and output hashes. A generic chip sample is not a production-board or kodeOS
qualification result. If a production sample is unavailable, report the blocker.

**“Install this binary on my Dot.”**
Check device identity, image processor/type/hash, loader compatibility, specific
approval and recovery evidence. Refuse the installation workflow when a required
contract is unknown; continue source inspection if useful. Do not fall back to
the historical S3 command or replace kodeOS.

## Current boundaries

ADR-0004 and ADR-0009 are accepted architectural decisions. Their implementation
and qualification remain outstanding. The old platform/core setup only supports
historical S3 research and is not production readiness evidence. CK-R001 tracks
the production evidence gap. Native ESP-IDF and TypeScript MCP are the agreed
working direction, but their detailed ADRs remain proposed. A read-only simulated MCP prototype exists
under `mcp/`; production services and hardware policy remain unimplemented.

## Newly located manufacturer integration

Consult `${CLAUDE_PLUGIN_ROOT}/docs/research/manufacturer-repositories.md` for the
Arduino P4 board/descriptor/mailbox implementation and archived components.
Source inspection establishes an integration candidate, not a verified deployment
route. Keep mailbox layout and pin/sensor claims revision-specific; master and the
6 MB feature branch differ. Preserve the distinction between that Arduino path
and native ESP-IDF packaging.
