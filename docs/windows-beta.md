# Windows unsigned beta candidates

The `Windows unsigned beta candidate` workflow is the reproducible build gate for an intentionally unsigned Windows x64 beta. It runs only through `workflow_dispatch` and uploads a GitHub Actions artifact; it never creates, edits, or uploads files to a GitHub Release.

Before dispatch, `package.json` must contain a version matching `X.Y.Z-beta.N`, and `docs/releases/<version>.md` must contain the reviewed release notes. The workflow installs the pinned pnpm version with the frozen lockfile, runs the repository lint, type, format, test, build, archive-integrity, and packaged-smoke gates, and packages with `--publish never` and prerelease publishing metadata. Stable `latest.yml` metadata is rejected.

For an equivalent local package after the build and packaged-runtime preparation steps, start with no existing `release/<version>` output and run the following in PowerShell without any signing credential environment variables:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:EP_PRE_RELEASE = "true"
$env:XINGCHAO_REQUIRE_CODE_SIGNING = "false"
pnpm.cmd exec electron-builder --win nsis --x64 --publish never `
  --config.publish.releaseType=prerelease `
  --config.publish.channel=beta `
  --config.generateUpdatesFilesForAllChannels=false `
  --config.forceCodeSigning=false
```

The explicit `channel=beta` is required: with the installed electron-builder, `releaseType=prerelease` alone still emits `latest.yml`.

The candidate artifact contains the ASCII-named installer and blockmap referenced by `beta.yml`, `RELEASE_NOTES.md`, `release-size-win32-x64.json`, `SHA256SUMS.txt`, `UNSIGNED-STATUS.txt`, the repository license and notice files, and the local texts from `resources/licenses/` under `licenses/`. Every staged license file is covered by `SHA256SUMS.txt`. Staging succeeds only when PowerShell reports the installer and unpacked application executable as exactly `NotSigned`; signed, invalid, or unknown states fail instead of being mislabeled.

Downloading the Actions artifact is not a public release. The unlicensed connection dependencies
have been replaced with first-party IPC. Use only a rebuilt candidate whose dependency manifest,
lockfile and compiled bundles exclude them; older candidates still require their redistribution
permission and must not be published.

Publishing is a separate user-authorized action. For `0.1.0-beta.1`, the user requested GitHub
upload after the IPC replacement and local candidate verification. Publish it only as an unsigned
prerelease, with the remaining full notice inventory, real-provider and installer-lifecycle
acceptance gaps stated in its release notes; none of these gaps may be reported as passed.
For the first public version, verify public download access, downloaded checksums and live beta
discovery immediately after upload and before announcing availability. Test upgrades from an earlier
public version when one exists. The unsigned beta must be described as unsigned wherever published.
