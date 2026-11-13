"""Installer portability, integrity and fail-closed behavior without downloads."""
import hashlib
from contextlib import redirect_stdout, redirect_stderr
import importlib.util
import io
from pathlib import Path
import subprocess
import shlex
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location(
    'kode_setup', Path(__file__).resolve().parents[1] / 'scripts/setup_environment.py')
setup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def test_official_node_archives_for_platforms(self):
        for system, machine, suffix in [('Windows', 'AMD64', '-win-x64.zip'),
            ('Windows', 'ARM64', '-win-arm64.zip'),
            ('Darwin', 'arm64', '-darwin-arm64.tar.gz'),
            ('Darwin', 'x86_64', '-darwin-x64.tar.gz'),
            ('Linux', 'x86_64', '-linux-x64.tar.xz'),
            ('Linux', 'aarch64', '-linux-arm64.tar.xz')]:
            with self.subTest(system=system, machine=machine):
                self.assertTrue(setup.node_archive(system, machine)[1].endswith(suffix))
        with self.assertRaises(setup.SetupError):
            setup.node_archive('Plan9', 'mips')

    def test_corrupt_archive_fails_checksum(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'archive'; p.write_bytes(b'corrupt')
            with self.assertRaisesRegex(setup.SetupError, 'SHA-256 mismatch'):
                setup.verify_sha256(p, hashlib.sha256(b'authentic').hexdigest())

    def test_zip_traversal_is_rejected_before_extracting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = root / 'node.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('../escape', 'bad')
            with self.assertRaises(setup.SetupError):
                setup.extract_node(archive, root / 'out')
            self.assertFalse((root / 'escape').exists())

    def test_tar_link_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = root / 'node.tar.gz'
            with tarfile.open(archive, 'w:gz') as t:
                entry = tarfile.TarInfo('node/link'); entry.type = tarfile.SYMTYPE
                entry.linkname = '../../outside'; t.addfile(entry)
            with self.assertRaises(setup.SetupError):
                setup.extract_node(archive, root / 'out')

    def test_valid_archive_handles_spaces(self):
        with tempfile.TemporaryDirectory(prefix='kode setup ') as tmp:
            root = Path(tmp); archive = root / 'node.tar.gz'
            with tarfile.open(archive, 'w:gz') as t:
                entry = tarfile.TarInfo('node/bin/node'); entry.size = 4
                t.addfile(entry, io.BytesIO(b'node'))
            setup.extract_node(archive, root / 'output space')
            self.assertEqual((root / 'output space/node/bin/node').read_bytes(), b'node')

    def test_argument_arrays_preserve_spaces_without_shell(self):
        with patch.object(setup.subprocess, 'run') as run:
            argument = Path('/path with spaces/arg')
            setup.run(['program', argument], cwd=Path('/working dir'))
            args, kwargs = run.call_args
            self.assertEqual(args[0], ['program', str(argument)])
            self.assertNotIn('shell', kwargs)
            self.assertTrue(kwargs['check'])

    def test_existing_wrong_sdk_is_not_reset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'esp-idf-v6.1').mkdir()
            with patch.object(setup.shutil, 'which', return_value='git'), \
                 patch.object(setup, 'run', return_value='wrong-head') as run:
                with self.assertRaisesRegex(setup.SetupError, 'refusing to reset'):
                    setup.setup_firmware(root, {'PATH': ''})
                self.assertEqual(run.call_count, 1)

    def test_host_failure_propagates_and_no_activation_is_written(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(setup, 'setup_host', side_effect=subprocess.CalledProcessError(9, 'npm')), \
             patch.object(setup, 'write_activation') as activation, \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(setup.main(['--host-only', '--state-dir', tmp]), 1)
            activation.assert_not_called()
            self.assertIn("SETUP INCOMPLETE", errors.getvalue())

    def test_host_only_skips_firmware_and_creates_activation(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(setup, 'setup_host', return_value=Path('/node path/bin/node')), \
             patch.object(setup, 'setup_firmware') as firmware, \
             redirect_stdout(io.StringIO()):
            self.assertEqual(setup.main(['--host-only', '--state-dir', tmp]), 0)
            firmware.assert_not_called()
            self.assertIn(shlex.quote(str(Path("/node path/bin/node").parent)),
                          (Path(tmp) / "activate.sh").read_text())
            self.assertNotIn('export.sh', (Path(tmp) / 'activate.sh').read_text())

    def test_activation_quotes_platform_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            setup.write_activation(root, Path('/node space/bin/node'),
                                   Path("/SDK's path"), Path('/tools space'))
            self.assertIn("SDK''s path", (root / 'activate.ps1').read_text())
            self.assertIn('call "' + str(Path("/SDK's path") / 'export.bat'),
                          (root / 'activate.cmd').read_text())
            self.assertIn('IDF_TOOLS_PATH', (root / 'activate.sh').read_text())


if __name__ == '__main__':
    unittest.main()
