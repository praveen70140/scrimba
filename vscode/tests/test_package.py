"""Exercise archive/release provenance with a tiny fixture, without building VS Code."""
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ReleasePackaging(unittest.TestCase):
    def test_archive_checksums_and_both_commit_hashes(self):
        with tempfile.TemporaryDirectory(prefix='vscode-package-test-') as temporary:
            project = Path(temporary)
            target = project / 'vscode'
            shutil.copytree(ROOT / 'scripts', target / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
            shutil.copytree(ROOT / 'patches', target / 'patches')
            shutil.copyfile(ROOT / 'upstream.json', target / 'upstream.json')
            build = target / 'VSCode-linux-x64'
            build.mkdir()
            # A fake executable exercises packaging only, never launches an app.
            (build / 'code-oss').write_text('fixture, not a VS Code binary\n')
            (project / 'README').write_text('packaging fixture\n')
            for args in [['init', '--quiet'], ['add', 'README'],
                         ['-c', 'user.name=Packaging Test', '-c', 'user.email=test@example.invalid',
                          'commit', '--quiet', '-m', 'Fixture']]:
                subprocess.run(['git', '-C', str(project), *args], check=True)
            commit = subprocess.check_output(['git', '-C', str(project), 'rev-parse', 'HEAD'], text=True).strip()
            env = dict(os.environ, GITHUB_SHA=commit, GITHUB_REPOSITORY='example/project', GITHUB_RUN_ID='123')
            subprocess.run(['python3', str(target / 'scripts/package.py')], env=env, check=True, capture_output=True)
            output = target / 'artifacts'
            manifest_path = next(output.glob('*.json'))
            manifest = json.loads(manifest_path.read_text())
            self.assertEqual(manifest['patch_commit'], commit)
            self.assertEqual(manifest['upstream'], json.loads((ROOT / 'upstream.json').read_text()))
            for line in (output / 'SHA256SUMS').read_text().splitlines():
                digest, name = line.split('  ')
                self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
            with tarfile.open(next(output.glob('*.tar.gz'))) as archive:
                embedded = archive.extractfile('VSCode-linux-x64/fullscreen-build.json').read()
                self.assertEqual(json.loads(embedded), manifest)
                self.assertIn('VSCode-linux-x64/code-oss', archive.getnames())
            notes = (target / 'release-notes.md').read_text()
            self.assertIn(commit, notes)
            self.assertIn(manifest['upstream']['commit'], notes)
            self.assertIn('actions/runs/123', notes)


if __name__ == '__main__':
    unittest.main()
