#!/usr/bin/env bash
# Adapted from the pinned upstream Linux Azure Pipelines (see ../upstream/).
# Intended for GitHub Actions only. Electron is downloaded prebuilt by upstream.
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/../.." && pwd)"
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Run this build in GitHub Actions, not locally.' >&2; exit 1; }
source_dir="$project_root/vscode/source"
cd "$source_dir"
export CI=true
export VSCODE_ARCH=x64
export npm_config_arch=x64
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export ONNXRUNTIME_NODE_INSTALL=skip
export FOUNDRY_LOCAL_SKIP_INSTALL=1
export VSCODE_SEQUENTIAL_NATIVE_INSTALLS=1

# product-build-linux-setup.yml and common/install-pnpm.yml:
# Use upstream's exact pnpm version and native compiler/sysroot setup.
node build/azure-pipelines/common/installPnpm.ts
pnpm --dir build install --frozen-lockfile
# setup-env.sh uses optional variables; upstream invokes it without nounset.
set +u
source ./build/azure-pipelines/linux/setup-env.sh
set -u
pnpm run preinstall
pnpm install --frozen-lockfile
node build/azure-pipelines/common/checkNativeOptionalDeps.ts

# common/install-builtin-extensions.yml and product-build-linux-compile.yml:
node build/lib/builtInExtensions.ts
node build/npm/electronTypes.ts
pnpm run gulp core-ci
pnpm run gulp vscode-linux-x64-min-ci
# The latter uses @vscode/gulp-electron with the pinned prebuilt Electron archive.
# Archive packaging is done after the fullscreen smoke test in the workflow.
