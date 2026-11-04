"""Exercise the archive guard with the same target input provided by SCons."""
import runpy
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

GUARD = (Path(__file__).resolve().parents[1] / 'archive' / 'esp32-s3' /
         'app' / 'extra_scripts' / 'build_only.py')


class ArchiveBuildOnlyTests(unittest.TestCase):
    def invoke(self, targets):
        scons = types.ModuleType('SCons')
        script = types.ModuleType('SCons.Script')
        script.COMMAND_LINE_TARGETS = targets
        scons.Script = script
        with patch.dict(sys.modules, {'SCons': scons, 'SCons.Script': script}):
            runpy.run_path(str(GUARD))

    def test_local_build_and_inspection(self):
        for targets in ([], ['buildprog'], ['size'], ['clean'], ['compiledb']):
            with self.subTest(targets=targets):
                self.invoke(targets)

    def test_device_and_unknown_targets_are_rejected(self):
        for target in ('upload', 'uploadfs', 'erase', 'erase_flash', 'debug',
                       'monitor', 'program', 'custom-device-target'):
            with self.subTest(target=target):
                with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_BUILD_ONLY'):
                    self.invoke([target])

    def test_build_target_does_not_mask_device_target(self):
        with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_BUILD_ONLY'):
            self.invoke(['buildprog', 'upload'])


if __name__ == '__main__':
    unittest.main()
