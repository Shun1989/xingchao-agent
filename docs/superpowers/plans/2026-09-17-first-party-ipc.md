# First-party Electron IPC replacement

Replace the two unlicensed connection dependencies using only Wanta's own service
contracts and call sites. Do not consult or copy their implementation or declarations.

## Design

- Keep the application's typed `invoke`, event subscription, service `send`, and
  disposal API; preserve `wanta/` service identifiers and the separate `wanta` UI bridge.
- Define service descriptors with exhaustive, compile-time checked method allowlists.
  Dispatch only those methods, never arbitrary instance/prototype members.
- Use Electron `ipcRenderer.invoke`/`ipcMain.handle` for requests and a dedicated
  event channel for pushes. Expose only narrow functions through contextBridge;
  never expose Electron objects or arbitrary channel access.
- Admit only the designated application window's main frame at the trusted renderer
  URL. Recheck trust before event delivery. Drop client registrations on navigation
  or destruction; reload creates a fresh registration. Dispose listeners/handlers.
- Preserve structured-clone values, including undefined and null. Return service
  errors as message-only envelopes; no main-process stack or custom error fields.
- Leave credentials, model behavior, business logic and branding untouched.

## Execution and acceptance

1. Write failing core/transport regression tests; implement minimal first-party modules.
2. Migrate all application contracts, imports and the real Electron mission harness.
3. Remove manifest/lockfile entries; update current architecture and release notices.
4. Run type checking, lint/format, full unit suite, real isolated Electron RPC and
   mission-history smoke, and independent implementation review.
5. Rebuild the unsigned beta and verify its archive contains the replacement, not
   either removed dependency. Run packaged smoke and regenerate candidate checksums.

GitHub upload remains separate: no upload until credentials are restored and the
remaining release gates have evidence. Historical artifacts are not the new build.

## Result

All five implementation/verification steps completed. Evidence and the current installer checksum
are recorded in `docs/windows-release-readiness.md` under the first-party IPC candidate section.
The rebuilt local candidate is `release/ipc-2026-09-17/candidate/`; it has not been published.
