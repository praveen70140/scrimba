#!/usr/bin/env python3
"""Archive Scrimba and record source provenance and the real verification outcome."""
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path
from prepare import ROOT, load_pin, patches
from appimage import build_appimage

pin = load_pin()
project = ROOT.parent
build = ROOT / 'VSCode-linux-x64'
brand = json.loads((ROOT / 'product-overrides.json').read_text())
if not (build / brand['applicationName']).is_file():
    raise SystemExit(f'Missing Scrimba build: {build}')
commit = os.environ['GITHUB_SHA']
actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=project, text=True).strip()
if actual != commit:
    raise SystemExit('GITHUB_SHA does not match the checked-out patch repository')
status = os.environ.get('VERIFICATION_STATUS', 'unknown')
if status not in {'success', 'failure', 'cancelled', 'skipped', 'unknown'}:
    raise SystemExit(f'Invalid verification status: {status}')
verified = status == 'success'
verification = {
    'status': status,
    'warning': None if verified else 'Fullscreen verification did not pass. This build needs manual testing; see the attached diagnostics.',
}
manifest = {
    'product': brand,
    'upstream': pin,
    'patch_repository': os.environ['GITHUB_REPOSITORY'],
    'patch_commit': commit,
    'workflow_run': f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
    'target': 'linux-x64',
    'electron': 'upstream prebuilt binary, unmodified',
    'verification': verification,
    'appimage_tools': json.loads((ROOT / 'appimage-tools.json').read_text()),
    'patches': [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in patches()],
}
output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
name = f'scrimba-fullscreen-{pin["version"]}-{commit[:12]}-linux-x64'
manifest_path = output / f'{name}.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
shutil.copyfile(manifest_path, build / 'fullscreen-build.json')
# Clear a stale warning when rerunning packaging after successful verification.
for warning in [output / 'VERIFICATION_FAILED.txt', build / 'VERIFICATION_FAILED.txt']:
    warning.unlink(missing_ok=True)
if not verified:
    warning = f'WARNING: fullscreen verification {status}.\n{verification["warning"]}\nWorkflow: {manifest["workflow_run"]}\n'
    (output / 'VERIFICATION_FAILED.txt').write_text(warning)
    (build / 'VERIFICATION_FAILED.txt').write_text(warning)
with tarfile.open(output / f'{name}.tar.gz', 'w:gz') as archive:
    archive.add(build, arcname='Scrimba-linux-x64')
if os.environ.get('BUILD_APPIMAGE') == '1':
    build_appimage(build, output / f'{name}.AppImage')
diagnostics = ROOT / 'verification'
if diagnostics.is_dir():
    with tarfile.open(output / f'{name}-verification.tar.gz', 'w:gz') as archive:
        archive.add(diagnostics, arcname='verification')
with (output / 'SHA256SUMS').open('w') as sums:
    for path in sorted(output.iterdir()):
        if path.name == 'SHA256SUMS' or not path.is_file():
            continue
        with path.open('rb') as asset:
            digest = hashlib.file_digest(asset, 'sha256').hexdigest()
        sums.write(f'{digest}  {path.name}\n')
validation = ('Passed: encoded H.264 MP4 and VP9 WebM playback, user-initiated fullscreen, and Escape exit under Xvfb.'
              if verified else f'**WARNING: fullscreen verification {status}.** The binaries built successfully, but automated verification did not pass. Test this build manually; the failure may be in the application or the test harness. See the attached verification diagnostics and workflow logs.')
notes = f'''Scrimba {pin['version']} with webview video fullscreen enabled.

{validation}

- Patch repository commit: `{commit}`
- Upstream VS Code commit: `{pin['commit']}` (tag `{pin['version']}`)
- Build workflow: {manifest['workflow_run']}
- Verification outcome: `{status}`
- Target: Linux x64 (`.AppImage` and portable `.tar.gz`)
- AppImage: `chmod +x scrimba-*.AppImage` and launch it. Without FUSE, use `./scrimba-*.AppImage --appimage-extract-and-run`.
- Archive: extract and run `Scrimba-linux-x64/bin/scrimba`
- Electron: the upstream pinned prebuilt binary, unmodified.
- Editor settings/extensions: separate `.scrimba-editor` directory; existing VS Code data is untouched.

The JSON manifest lists the applied patches, checksums, and verification outcome.
The manifest is embedded as `fullscreen-build.json` inside the archive.
Scrimba is a renamed MIT-licensed Code - OSS distribution. Its internal data
folder is separate from `~/.scrimba`, where the course extension stores lessons.
'''
(ROOT / 'release-notes.md').write_text(notes)
print(name)
