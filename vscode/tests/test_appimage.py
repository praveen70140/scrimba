"""Check AppImage layout and launch forwarding using a tiny fake app, no editor build."""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('appimage', ROOT / 'scripts/appimage.py')
appimage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(appimage)


class AppImageLayout(unittest.TestCase):
    def test_launcher_forwards_arguments_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='scrimba-appimage-test-') as temporary:
            root = Path(temporary)
            build = root / 'build'
            (build / 'bin').mkdir(parents=True)
            launcher = build / 'bin/scrimba'
            launcher.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            launcher.chmod(0o755)
            (build / 'scrimba').symlink_to('bin/scrimba')
            icon = root / 'icon.png'
            icon.write_bytes(b'fixture icon')
            directory = root / 'Scrimba with spaces.AppDir'
            appimage.make_appdir(build, directory, icon)
            env = dict(os.environ, APPDIR=str(directory))
            result = subprocess.check_output([str(directory / 'AppRun'), '--new-window', 'folder with spaces'], text=True, env=env)
            self.assertEqual(result.splitlines(), ['--new-window', 'folder with spaces'])
            self.assertTrue((directory / 'usr/lib/scrimba/scrimba').is_symlink())
            self.assertEqual((directory / '.DirIcon').resolve(), directory / 'scrimba.png')
            desktop = (directory / 'scrimba.desktop').read_text()
            self.assertIn('Name=Scrimba', desktop)
            self.assertIn('Exec=AppRun %F', desktop)

    def test_tooling_is_pinned_to_versions_and_full_checksums(self):
        pins = json.loads((ROOT / 'appimage-tools.json').read_text())
        for tool in pins.values():
            self.assertNotIn('/continuous/', tool['url'])
            self.assertIn('/' + tool['version'] + '/', tool['url'])
            self.assertRegex(tool['sha256'], r'^[0-9a-f]{64}$')


if __name__ == '__main__':
    unittest.main()
