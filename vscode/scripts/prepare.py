#!/usr/bin/env python3
"""Fetch and patch the exact VS Code release; never installs or builds anything."""
import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None, capture=False, env=None):
    return subprocess.run(args, cwd=cwd, env=env, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def load_pin():
    pin = json.loads((ROOT / 'upstream.json').read_text())
    if pin['repository'] != 'https://github.com/microsoft/vscode.git':
        raise ValueError('Only the official VS Code repository is supported')
    if not re.fullmatch(r'[0-9a-f]{40}', pin['commit']):
        raise ValueError('The upstream commit must be a full SHA')
    if not re.fullmatch(r'\d+\.\d+\.\d+', pin['version']):
        raise ValueError('Expected a stable release version')
    if pin['ref'] != 'refs/tags/' + pin['version']:
        raise ValueError('The pinned tag and version disagree')
    return pin


def patches():
    result = []
    for name in (ROOT / 'patches/series').read_text().splitlines():
        if not name or name.startswith('#'):
            continue
        if not re.fullmatch(r'[a-zA-Z0-9._-]+\.patch', name):
            raise ValueError(f'Invalid patch name: {name}')
        patch = ROOT / 'patches' / name
        if not patch.is_file():
            raise ValueError(f'Missing patch: {name}')
        result.append(patch)
    if not result or len(result) != len(set(result)):
        raise ValueError('The patch series must be nonempty and contain no duplicates')
    return result


def prepare(source):
    pin = load_pin()
    patch_files = patches()
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        run('git', 'clone', '--depth', '1', '--single-branch', '--branch', pin['version'],
            pin['repository'], str(source))
    head = run('git', 'rev-parse', 'HEAD', cwd=source, capture=True).strip()
    tag = run('git', 'rev-parse', pin['ref'] + '^{commit}', cwd=source, capture=True).strip()
    if head != pin['commit'] or tag != pin['commit']:
        raise ValueError(f'Source HEAD/tag does not match pinned commit {pin["commit"]}; '
                         'use a new empty source directory after changing the pin')
    if json.loads((source / 'package.json').read_text())['version'] != pin['version']:
        raise ValueError('The source package version disagrees with the pin')
    diff = run('git', 'diff', '--binary', 'HEAD', cwd=source, capture=True)
    # Accept exactly our patch series for idempotent local/CI use. Never reset a checkout.
    # Ask Git to compute the canonical combined diff using a temporary index.
    # Patch-series order need not match Git's path order, and patches may build
    # on earlier patches. The real checkout and its index remain untouched.
    with tempfile.TemporaryDirectory(prefix='vscode-patch-index-') as temporary:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(temporary) / 'index'))
        run('git', 'read-tree', 'HEAD', cwd=source, env=env)
        for patch in patch_files:
            run('git', 'apply', '--cached', str(patch), cwd=source, env=env)
        expected = run('git', 'diff', '--cached', '--binary', 'HEAD',
                       cwd=source, env=env, capture=True)
    if diff:
        if diff != expected:
            raise ValueError('Source has unexpected local changes; refusing to overwrite them')
        run('git', 'apply', '--reverse', '--check', *map(str, reversed(patch_files)), cwd=source)
        print('Pinned source already has exactly the expected patches')
        return
    run('git', 'apply', '--check', *map(str, patch_files), cwd=source)
    run('git', 'apply', *map(str, patch_files), cwd=source)
    print(f'Prepared VS Code {pin["version"]} ({pin["commit"]}) at {source}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'source')
    args = parser.parse_args()
    prepare(args.source.resolve())
