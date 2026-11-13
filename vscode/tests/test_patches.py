"""Fast policy and patch regression checks. No VS Code dependencies or builds."""
import importlib.util
import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'scripts/prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
SOURCE = ROOT / 'source'
WEBVIEW = 'src/vs/workbench/contrib/webview/browser/webviewElement.ts'
INNER = 'src/vs/workbench/contrib/webview/browser/pre/index.html'
APP = 'src/vs/code/electron-main/app.ts'
GULP = 'build/gulpfile.vscode.ts'


class FullscreenPatches(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pin = prepare.load_pin()
        cls.scratch = tempfile.TemporaryDirectory(prefix='vscode-patch-test-')
        cls.tree = Path(cls.scratch.name)
        cls.original = {}
        for rel in [WEBVIEW, INNER, APP, GULP]:
            data = subprocess.check_output(['git', '-C', str(SOURCE), 'show', f'{cls.pin["commit"]}:{rel}'])
            cls.original[rel] = data.decode()
            target = cls.tree / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        subprocess.run(['git', 'init', '--quiet', str(cls.tree)], check=True)
        subprocess.run(['git', '-C', str(cls.tree), 'apply', '--check', *map(str, prepare.patches())], check=True)
        subprocess.run(['git', '-C', str(cls.tree), 'apply', *map(str, prepare.patches())], check=True)

    @classmethod
    def tearDownClass(cls):
        cls.scratch.cleanup()

    def test_exact_release_pin(self):
        head = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
        self.assertEqual(head, self.pin['commit'])
        self.assertEqual(json.loads((SOURCE / 'package.json').read_text())['version'], self.pin['version'])

    def test_patch_changes_only_fullscreen_gates_and_oss_packaging(self):
        touched = []
        for patch in prepare.patches():
            touched.extend(re.findall(r'^\+\+\+ b/(.+)$', patch.read_text(), re.M))
        self.assertEqual(set(touched), {WEBVIEW, INNER, APP, GULP})
        self.assertEqual(len(touched), 4)

    def test_both_iframes_delegate_fullscreen(self):
        outer = (self.tree / WEBVIEW).read_text()
        inner = (self.tree / INNER).read_text()
        self.assertIn("'fullscreen'];", outer)
        self.assertIn('element.allowFullscreen = true;', outer)
        self.assertIn("'fullscreen;'];", inner)
        self.assertIn('newFrame.allowFullscreen = true;', inner)

    def test_sandbox_restrictions_preserved(self):
        for rel in [WEBVIEW, INNER]:
            before = [line for line in self.original[rel].splitlines() if 'sandbox' in line.lower()]
            after = [line for line in (self.tree / rel).read_text().splitlines() if 'sandbox' in line.lower()]
            self.assertEqual(before, after)

    def test_fullscreen_permission_is_scoped_to_webviews(self):
        text = (self.tree / APP).read_text()
        webview = text.split('const allowedPermissionsInWebview = new Set([', 1)[1].split(']);', 1)[0]
        core = text.split('const allowedPermissionsInCore = new Set([', 1)[1].split(']);', 1)[0]
        self.assertIn("'fullscreen'", webview)
        self.assertNotIn("'fullscreen'", core)
        self.assertEqual(text.count('allowedPermissionsInWebview.has(permission)'), 2)
        self.assertIn('return callback(false);', text)
        self.assertIn('return false;', text)

    def test_patch_is_reversible(self):
        subprocess.run(['git', '-C', str(self.tree), 'apply', '--reverse', '--check',
                        *map(str, reversed(prepare.patches()))], check=True)

    def test_prepare_is_idempotent(self):
        before = subprocess.check_output(['git', '-C', str(SOURCE), 'diff', 'HEAD'])
        prepare.prepare(SOURCE)
        after = subprocess.check_output(['git', '-C', str(SOURCE), 'diff', 'HEAD'])
        self.assertEqual(before, after)

    def test_copied_pipeline_matches_pinned_source(self):
        for target in (ROOT / 'upstream').rglob('*'):
            if target.is_file():
                relative = target.relative_to(ROOT / 'upstream')
                self.assertEqual(target.read_bytes(), (SOURCE / relative).read_bytes(), str(relative))

    def test_upstream_build_targets_exist(self):
        gulp = (SOURCE / 'build/gulpfile.vscode.ts').read_text()
        self.assertIn("task.define('core-ci'", gulp)
        self.assertIn("{ platform: 'linux', arch: 'x64' }", gulp)
        for path in ['build/azure-pipelines/linux/setup-env.sh',
                     'build/azure-pipelines/common/installPnpm.ts',
                     'build/azure-pipelines/common/checkNativeOptionalDeps.ts',
                     'build/npm/electronTypes.ts', 'build/lib/builtInExtensions.ts']:
            self.assertTrue((SOURCE / path).is_file(), path)

    def test_copilot_packaging_handles_absent_present_and_broken_sdk(self):
        subprocess.run(['node', str(ROOT / 'tests/copilot-packaging.cjs'),
                        str(self.tree / GULP)], check=True)

    def test_local_build_is_refused(self):
        env = dict(os.environ)
        env.pop('GITHUB_ACTIONS', None)
        result = subprocess.run(['bash', str(ROOT / 'scripts/build-linux.sh')],
                                env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not locally', result.stderr)


if __name__ == '__main__':
    unittest.main()
