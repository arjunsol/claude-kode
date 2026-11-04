"""Limit the archived PlatformIO recipe to local build/inspection targets.

This guard protects this recipe, not arbitrary shell or device access.
"""
from SCons.Script import COMMAND_LINE_TARGETS

ALLOWED_TARGETS = {"buildprog", "size", "clean", "envdump", "idedata", "compiledb"}
blocked = set(COMMAND_LINE_TARGETS) - ALLOWED_TARGETS
if blocked:
    raise RuntimeError(
        "ARCHIVE_BUILD_ONLY: unreleased S3 prototype; deployment and device targets "
        "are disabled. Rejected targets: " + ", ".join(sorted(blocked))
    )
