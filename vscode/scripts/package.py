#!/usr/bin/env python3
"""Archive the upstream Linux build and record exact source/patch provenance."""
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path
from prepare import ROOT, load_pin, patches

pin = load_pin()
project = ROOT.parent
build = ROOT / 'VSCode-linux-x64'
if not (build / 'code-oss').is_file():
    raise SystemExit(f'Missing upstream build: {build}')
commit = os.environ['GITHUB_SHA']
actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=project, text=True).strip()
if actual != commit:
    raise SystemExit('GITHUB_SHA does not match the checked-out patch repository')
manifest = {
    'upstream': pin,
    'patch_repository': os.environ['GITHUB_REPOSITORY'],
    'patch_commit': commit,
    'workflow_run': f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
    'target': 'linux-x64',
    'electron': 'upstream prebuilt binary, unmodified',
    'patches': [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in patches()],
}
# Match upstream product-build-linux-package.yml's archive layout.
output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
name = f'code-oss-fullscreen-{pin["version"]}-{commit[:12]}-linux-x64'
manifest_path = output / f'{name}.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
shutil.copyfile(manifest_path, build / 'fullscreen-build.json')
with tarfile.open(output / f'{name}.tar.gz', 'w:gz') as archive:
    archive.add(build, arcname=build.name)
with (output / 'SHA256SUMS').open('w') as sums:
    for path in sorted(output.iterdir()):
        if path.name == 'SHA256SUMS' or not path.is_file():
            continue
        with path.open('rb') as asset:
            digest = hashlib.file_digest(asset, 'sha256').hexdigest()
        sums.write(f'{digest}  {path.name}\n')
notes = f'''Code - OSS {pin['version']} with webview video fullscreen enabled.

- Patch repository commit: `{commit}`
- Upstream VS Code commit: `{pin['commit']}` (tag `{pin['version']}`)
- Build workflow: {manifest['workflow_run']}
- Target: Linux x64 (portable `.tar.gz`; extract and run `VSCode-linux-x64/bin/code-oss`)
- Electron: the upstream pinned prebuilt binary, unmodified.
- Validation: nested-webview video playback, user-initiated fullscreen, and Escape exit passed in the packaged app under Xvfb.

The JSON manifest lists the applied patches and their SHA-256 checksums. The same
manifest is included inside the archive as `fullscreen-build.json`.
This is the upstream MIT-licensed Code - OSS distribution with its default branding.
'''
(ROOT / 'release-notes.md').write_text(notes)
print(name)
