# Windows local candidate — 2026-09-13

Source baseline: `aa01e97`, `codex/xingchao-platform`.

## Verified

- Production type checking and renderer/main/preload builds passed.
- All six platform binaries and bundled Skills/tool runtime were prepared.
- SQLite 6.0.1 rebuilt successfully against Electron 42.4.0 x64.
- NSIS packaging completed with exit code 0 and `--publish never`.
- Local output: `release/0.1.0/星潮航局-0.1.0-Setup.exe` (275,606,824 bytes).
- Authenticode status: `NotSigned`. SHA-256:
  `C2572382DD0A6517A03CAEE93D88C02D585C72B748B2E252D3661643F315C034`.
- Packaged ASAR contains the SQLite native module, no top-level `wanta` profile,
  and no `http://localhost:6037` development URL in the main entry.
- The packaged executable loaded its packaged SQLite module and ran
  `select 42 as result` against an in-memory database, returning `42`.
- The development desktop was started with `dev:worktree` and its settings route;
  Windows reported a responsive window titled `星潮航局`.

## Reproduction requirements on this host

The initial build could not discover Python. Set `npm_config_python` to an installed
Python executable before running `corepack pnpm run build:win`. This host used the
Codex bundled Python. Visual Studio 2022 Build Tools with the x64 C++ component is
installed. Native compilation needs write access to Electron's header cache.

Electron download initially failed certificate validation. Setting
`NODE_OPTIONS=--use-system-ca` succeeded using the system trust store; TLS validation
was not disabled. After production outputs and resources are prepared, the packaging
step alone can be repeated with `electron-builder --win --publish never`.

## Outstanding acceptance

This is a local candidate, not release acceptance. Clean-profile GUI launch,
installation, upgrade, uninstall, signing and public distribution remain unverified.
No release or installer was published.

The user authorized DeepSeek `deepseek-v4.1-flash`, with fallback to
`deepseek-v4-flash`, and a total ceiling of CNY 50 for this acceptance run. The stored
key could not be decrypted even outside the sandbox. The app is open for the user to
replace it. No paid request has been made. Confirm the live model list and current
pricing before executing; a successful API response alone is not end-to-end Mission
or deliverable acceptance.
