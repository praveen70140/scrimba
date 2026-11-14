#!/usr/bin/env python3
"""Package the already-built editor as an AppImage; never builds Electron or VS Code."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def make_appdir(build, appdir, icon):
    app = appdir / 'usr/lib/scrimba'
    app.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(build, app, symlinks=True)
    launcher = appdir / 'AppRun'
    launcher.write_text('''#!/bin/sh
set -e
appdir="${APPDIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"
exec "$appdir/usr/lib/scrimba/bin/scrimba" "$@"
''')
    launcher.chmod(0o755)
    (appdir / 'scrimba.desktop').write_text('''[Desktop Entry]
Type=Application
Name=Scrimba
Comment=Interactive coding lessons and editor
Exec=AppRun %F
Icon=scrimba
Categories=Development;IDE;TextEditor;
Terminal=false
StartupWMClass=Scrimba
MimeType=x-scheme-handler/scrimba;
''')
    shutil.copyfile(icon, appdir / 'scrimba.png')
    (appdir / '.DirIcon').symlink_to('scrimba.png')


def download_checked(spec, destination):
    with urllib.request.urlopen(spec['url'], timeout=120) as response, destination.open('wb') as out:
        shutil.copyfileobj(response, out)
    with destination.open('rb') as downloaded:
        digest = hashlib.file_digest(downloaded, 'sha256').hexdigest()
    if digest != spec['sha256']:
        raise ValueError(f'Checksum mismatch for {spec["url"]}: {digest}')
    destination.chmod(0o755)


def build_appimage(build, output):
    pins = json.loads((ROOT / 'appimage-tools.json').read_text())
    with tempfile.TemporaryDirectory(prefix='scrimba-appimage-') as temporary:
        work = Path(temporary)
        tool = work / 'appimagetool.AppImage'
        runtime = work / 'runtime-x86_64'
        download_checked(pins['appimagetool'], tool)
        download_checked(pins['runtime'], runtime)
        # Run the tooling without requiring FUSE on the CI runner.
        subprocess.run([str(tool), '--appimage-extract'], cwd=work, check=True, stdout=subprocess.DEVNULL)
        appdir = work / 'Scrimba.AppDir'
        make_appdir(build, appdir, ROOT / 'source/resources/linux/code.png')
        subprocess.run([str(work / 'squashfs-root/AppRun'), '--runtime-file', str(runtime),
                        str(appdir), str(output.resolve())],
                       env=dict(os.environ, ARCH='x86_64', APPDIR=str(work / 'squashfs-root')), check=True)
    output.chmod(0o755)
    with output.open('rb') as image:
        header = image.read(11)
    if header[:4] != b'\x7fELF' or header[8:11] != b'AI\x02':
        raise ValueError('The output is not a type-2 AppImage')
