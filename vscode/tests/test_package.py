"""Exercise release provenance and warning behavior without building VS Code."""
import hashlib
import importlib.util
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
    def package_fixture(self, status):
        temporary = tempfile.TemporaryDirectory(prefix='scrimba-package-test-')
        self.addCleanup(temporary.cleanup)
        project = Path(temporary.name)
        target = project / 'vscode'
        shutil.copytree(ROOT / 'scripts', target / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT / 'patches', target / 'patches')
        for name in ['upstream.json', 'product-overrides.json', 'appimage-tools.json']:
            shutil.copyfile(ROOT / name, target / name)
        build = target / 'VSCode-linux-x64'
        build.mkdir()
        (build / 'scrimba').write_text('fixture, not an editor binary\n')
        diagnostics = target / 'verification'
        diagnostics.mkdir()
        (diagnostics / 'verification.log').write_text(f'fixture: {status}\n')
        (project / 'README').write_text('packaging fixture\n')
        for args in [['init', '--quiet'], ['add', 'README'],
                     ['-c', 'user.name=Packaging Test', '-c', 'user.email=test@example.invalid',
                      'commit', '--quiet', '-m', 'Fixture']]:
            subprocess.run(['git', '-C', str(project), *args], check=True)
        commit = subprocess.check_output(['git', '-C', str(project), 'rev-parse', 'HEAD'], text=True).strip()
        env = dict(os.environ, GITHUB_SHA=commit, GITHUB_REPOSITORY='example/project', GITHUB_RUN_ID='123')
        env.pop('VERIFICATION_STATUS', None)
        if status is not None:
            env['VERIFICATION_STATUS'] = status
        subprocess.run(['python3', str(target / 'scripts/package.py')], env=env, check=True, capture_output=True)
        return target, commit

    def test_archive_checksums_and_both_commit_hashes(self):
        target, commit = self.package_fixture('success')
        output = target / 'artifacts'
        manifest = json.loads(next(output.glob('*.json')).read_text())
        self.assertEqual(manifest['patch_commit'], commit)
        self.assertEqual(manifest['upstream'], json.loads((ROOT / 'upstream.json').read_text()))
        self.assertEqual(manifest['verification'], {'status': 'success', 'warning': None})
        self.assertEqual(manifest['product']['applicationName'], 'scrimba')
        for line in (output / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split('  ')
            self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
        app_archive = next(p for p in output.glob('*.tar.gz') if not p.name.endswith('-verification.tar.gz'))
        with tarfile.open(app_archive) as archive:
            embedded = archive.extractfile('Scrimba-linux-x64/fullscreen-build.json').read()
            self.assertEqual(json.loads(embedded), manifest)
            self.assertIn('Scrimba-linux-x64/scrimba', archive.getnames())
            self.assertNotIn('Scrimba-linux-x64/VERIFICATION_FAILED.txt', archive.getnames())
        with tarfile.open(next(output.glob('*-verification.tar.gz'))) as archive:
            self.assertIn('verification/verification.log', archive.getnames())
        self.assertFalse((output / 'VERIFICATION_FAILED.txt').exists())
        notes = (target / 'release-notes.md').read_text()
        self.assertIn(commit, notes)
        self.assertIn(manifest['upstream']['commit'], notes)
        self.assertIn('actions/runs/123', notes)
        self.assertIn('Scrimba-linux-x64/bin/scrimba', notes)

    def test_failed_verification_still_packages_with_warning(self):
        for status in ['failure', 'cancelled', 'skipped', None]:
            with self.subTest(status=status):
                target, _ = self.package_fixture(status)
                output = target / 'artifacts'
                manifest = json.loads(next(output.glob('*.json')).read_text())
                self.assertEqual(manifest['verification']['status'], status or 'unknown')
                self.assertTrue(manifest['verification']['warning'])
                self.assertTrue((output / 'VERIFICATION_FAILED.txt').exists())
                app_archive = next(p for p in output.glob('*.tar.gz') if not p.name.endswith('-verification.tar.gz'))
                with tarfile.open(app_archive) as archive:
                    self.assertIn('Scrimba-linux-x64/VERIFICATION_FAILED.txt', archive.getnames())
                    self.assertIn('Scrimba-linux-x64/scrimba', archive.getnames())
                notes = (target / 'release-notes.md').read_text()
                self.assertIn('WARNING', notes)
                self.assertNotIn('Passed:', notes)

    def test_branding_preserves_upstream_configuration_and_is_idempotent(self):
        spec = importlib.util.spec_from_file_location('brand', ROOT / 'scripts/brand.py')
        brand = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(brand)
        with tempfile.TemporaryDirectory(prefix='scrimba-brand-test-') as temporary:
            source = Path(temporary)
            original = json.loads((ROOT / 'source/product.json').read_text())
            (source / 'product.json').write_text(json.dumps(original))
            brand.apply_branding(source)
            configured = json.loads((source / 'product.json').read_text())
            self.assertEqual(configured['nameLong'], 'Scrimba')
            self.assertEqual(configured['applicationName'], 'scrimba')
            self.assertEqual(configured['dataFolderName'], '.scrimba-editor')
            self.assertEqual(configured['sharedDataFolderName'], '.scrimba-editor-shared')
            self.assertEqual(configured['urlProtocol'], 'scrimba')
            self.assertEqual(configured['builtInExtensions'], original['builtInExtensions'])
            self.assertEqual(configured['electronArtifactFeed'], original['electronArtifactFeed'])
            before = (source / 'product.json').read_bytes()
            brand.apply_branding(source)
            self.assertEqual((source / 'product.json').read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
