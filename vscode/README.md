# Scrimba editor with video fullscreen

This directory carries a small patch series for the desktop editor. The source is
pinned to VS Code **1.146.0**, commit
`69047191fc427f2f92828279aae1d90d8eeda7ab`, in `upstream.json`.
On November 13, 2026, the official stable update API and GitHub release both
identified this version as the latest stable release. CI always uses this exact
commit; it does not follow `main` or a moving stable channel.

The local clone is `vscode/source/`, which is ignored by the parent repository.
Only the pin, branding configuration, patches, scripts, copied pipeline references, and test fixture are
tracked. Preparing or validating the patches does not install VS Code dependencies
or build VS Code:

```bash
python3 vscode/scripts/prepare.py
python3 -m unittest discover -s vscode/tests -p 'test_*.py' -v
```

`prepare.py` checks the release tag, commit, and package version before applying
`patches/series`. Re-running it accepts exactly the expected patched source. It
refuses unexpected local changes instead of resetting the source checkout.

## Scrimba application identity

Before building, `scripts/brand.py` overlays `product-overrides.json` on upstream
`product.json`. The editor is named **Scrimba**, its executable and CLI are
`scrimba`, and its URL scheme is `scrimba://`. Editor settings and extensions use
`.scrimba-editor` and shared editor storage uses `.scrimba-editor-shared`.
Those directories are separate from both VS Code and `~/.scrimba` course data.
This is distribution configuration, not another VS Code source patch. The source
checkout is still named `vscode/source` for the existing build tooling.

## What the patch enables

VS Code nests extension HTML inside two iframes. The patch delegates the
`fullscreen` permission through both and sets their `allowFullscreen` properties.
The desktop application's session permission allowlist also needs `fullscreen`
for requests from `vscode-webview://` content. Both its request and check handlers
use that allowlist. Other origins and existing sandbox restrictions are unchanged.

This permits any scripted extension webview to call `video.requestFullscreen()`
in response to a user click. No extension API flag is added. The change is scoped
to VS Code source: **Electron and Chromium are neither patched nor compiled**.
The upstream build downloads the pinned, prebuilt Electron distribution.

An extension must still expose fullscreen through its own button or video
controls. For example, inside a webview with scripts enabled:

```js
button.addEventListener('click', async () => {
  await video.requestFullscreen();
});
```

The smoke-test extension is an isolated CI fixture. This change does not add a
fullscreen button to the Scrimba extension itself.

## OSS packaging compatibility

The pinned upstream CI packaging task unconditionally prepares a Copilot SDK
shim. Microsoft's product pipeline supplies that extension as a separate Azure
artifact; the public `core-ci` task excludes it. The second patch skips shim
preparation only when the packaged Copilot extension directory is absent. If the
extension is included, the existing SDK validation still runs and fails on an
incomplete SDK. This keeps the archive build independent of Microsoft's pipeline
artifacts without hiding broken Copilot packages.

## GitHub Actions builds and releases

`.github/workflows/vscode-fullscreen.yml` runs on pushes to `main` that change
`vscode/**` or the workflow itself. Pull requests run the lightweight patch checks.
A manual workflow dispatch on `main` can also build and release the pinned version.
Changes elsewhere in Scrimba do not trigger a VS Code rebuild.

The workflow:

1. Clones the pinned release, verifies its full commit hash, and applies the series.
2. Runs the patch regression checks without compiling anything.
3. Uses upstream's `.nvmrc`, pinned pnpm version, Linux native-toolchain setup,
   built-in extension downloader, and `core-ci` / `vscode-linux-x64-min-ci` tasks.
4. Starts the packaged app under Xvfb, loads a real extension webview, plays a
   generated video stream, clicks its fullscreen button, and verifies Escape exits.
5. Archives the application using upstream's portable Linux archive layout.
6. Publishes a GitHub Release with the archive, a provenance JSON file,
   verification diagnostics, and `SHA256SUMS`. The JSON is also embedded as
   `fullscreen-build.json` in the app.

Release tags contain the pinned VS Code version and the **full Scrimba commit
SHA**. Release notes record both the Scrimba commit and upstream VS Code commit,
plus the Actions run URL. Re-running a build for the same commit updates that
commit's release assets. A successful build is published even if fullscreen verification fails or times
out. Such releases have **verification failed** in the title and a warning in the
notes, manifest, and `VERIFICATION_FAILED.txt` (also inside the app archive).
The diagnostics archive includes the test output, editor logs, activation marker,
window/frame details, and screenshots when available. This allows manual testing
without presenting an unverified build as tested. Compilation/packaging failures
still prevent publication. The workflow uses the repository's normal `GITHUB_TOKEN`; it
needs no custom release secret. Only the release job has `contents: write`.

The initial target is **Linux x64**, delivered as `.tar.gz`. Extract it and run
`Scrimba-linux-x64/bin/scrimba`. The archive is named `scrimba-fullscreen-...tar.gz`;
upstream's internal staging folder remains `VSCode-linux-x64`. Its separate editor
identity and data directories let it coexist with VS Code.
Windows, macOS, ARM, native installer packages, Microsoft signing, remote-server
artifacts, and Microsoft distribution mixins are outside this initial pipeline.

## Upstream pipeline provenance

The verbatim MIT-licensed references under `upstream/` are copied from the pinned
release, including its license:

- `build/azure-pipelines/linux/steps/product-build-linux-setup.yml`
- `build/azure-pipelines/linux/steps/product-build-linux-compile.yml`
- `build/azure-pipelines/linux/steps/product-build-linux-package.yml`

VS Code's product release pipeline runs on Azure Pipelines. Those templates
include Microsoft-specific Azure Key Vault, private distribution, signing, and
upload services. They cannot run unchanged in another repository's GitHub Actions.
Our workflow translates their public desktop setup, compilation, and archive
steps; `scripts/build-linux.sh` invokes the actual pinned upstream scripts/tasks.
The copied templates are reference material, not additional workflows.

Builds compile VS Code and its native Node modules in GitHub Actions. They do not
compile Electron. `build-linux.sh` refuses to run outside GitHub Actions.

## Updating the pin

Choose a new stable tag deliberately, update `upstream.json` with its full commit,
and use a fresh `source/` checkout. Rebase the patches and refresh the copied
pipeline files from that same tag. Run the lightweight checks, then push the
change. The hosted build must pass before a release appears; failed fullscreen verification is published with an explicit warning.
Do not edit the ignored checkout as the permanent source of a patch: regenerate
the tracked patch files from its diff.
